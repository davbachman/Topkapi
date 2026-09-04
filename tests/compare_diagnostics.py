#!/usr/bin/env python3
"""Quantify exact parity differences without modifying either baseline or actual output."""
import collections
import difflib
import json
import math
import pathlib
import re
import sys
import xml.etree.ElementTree as ET


native = pathlib.Path(sys.argv[1])
browser = pathlib.Path(sys.argv[2])
report = {'drawing': {}, 'svg': {}}


def command(value):
    prefix, coordinates = value.split(':', 1)
    return prefix.split('/'), list(map(int, re.findall(r'-?\d+', coordinates)))


def flatten(value):
    if isinstance(value, list):
        for item in value:
            yield from flatten(item)
    else:
        yield value


def numeric_difference(before, after):
    a, b = list(flatten(before)), list(flatten(after))
    if len(a) != len(b):
        return {'nativeCount': len(a), 'browserCount': len(b)}
    changes = [(i, x, y, abs(x-y)) for i, (x,y) in enumerate(zip(a,b)) if x != y]
    return {'scalarCount': len(a), 'differentScalars': len(changes),
            'maxAbsoluteDifference': max((change[3] for change in changes), default=0),
            'largestDifferences': sorted(changes, key=lambda change: -change[3])[:10]}


for stem in ('ochre', 'honey', 'spiky'):
    p, q = native / f'{stem}.json', browser / f'{stem}.json'
    if not p.exists() or not q.exists():
        continue
    a, b = json.loads(p.read_text()), json.loads(q.read_text())
    first, second = a['commands'], b['commands']
    changes = []
    coordinate_differences = 0
    color_differences = 0
    max_coordinate_difference = 0
    max_color_channel_difference = 0
    for index, (x,y) in enumerate(zip(first,second)):
        if x == y:
            continue
        xp, xc = command(x)
        yp, yc = command(y)
        changed_coordinates = [(i, v, w) for i, (v,w) in enumerate(zip(xc,yc)) if v != w]
        if changed_coordinates:
            coordinate_differences += 1
            max_coordinate_difference = max(max_coordinate_difference, max(abs(v-w) for _,v,w in changed_coordinates))
        if xp[1] != yp[1]:
            color_differences += 1
            xrgb, yrgb = int(xp[1]), int(yp[1])
            max_color_channel_difference = max(max_color_channel_difference,
                max(abs(((xrgb>>shift)&255)-((yrgb>>shift)&255)) for shift in (0,8,16,24)))
        item = {'index': index, 'native': x, 'browser': y, 'coordinateDifferences': changed_coordinates,
                'prefixChanged': xp != yp}
        if 'shadeValues' in a:
            av,bv = a['shadeValues'][index],b['shadeValues'][index]
            item['shadeValues'] = [av,bv]
            item['shadeIndices'] = [int(av),int(bv)]
        changes.append(item)
    unmatched_native = collections.Counter(first) - collections.Counter(second)
    unmatched_browser = collections.Counter(second) - collections.Counter(first)
    result = {
        'nativeCommandCount': len(first), 'browserCommandCount': len(second),
        'orderedChangedCommands': len(changes),
        'unmatchedNativeCommandInstances': sum(unmatched_native.values()),
        'unmatchedBrowserCommandInstances': sum(unmatched_browser.values()),
        'commandsWithCoordinateDifferences': coordinate_differences,
        'commandsWithColorDifferences': color_differences,
        'maxCoordinateDifferencePixels': max_coordinate_difference,
        'maxColorChannelDifference': max_color_channel_difference,
        'changes': changes,
        'sourcePoints': numeric_difference(a['sourcePoints'],b['sourcePoints']),
    }
    if 'shadowPolygons' in a:
        result['shadowPolygons'] = numeric_difference(a['shadowPolygons'],b['shadowPolygons'])
        result['shadowsIdentical'] = a['shadows'] == b['shadows']
    if 'shadeValues' in a:
        result['shadeValues'] = numeric_difference(a['shadeValues'],b['shadeValues'])
        result['palettesIdentical'] = a['palette'] == b['palette']
        result['lightIdentical'] = a['light'] == b['light']
    report['drawing'][stem] = result
    print(stem, ':', len(changes), '/', len(first), 'changed commands;', coordinate_differences,
          'with coordinates;', color_differences, 'with colors; max pixel delta', max_coordinate_difference,
          '; max RGB channel delta', max_color_channel_difference)
    print('  unrounded source points max delta:', result['sourcePoints']['maxAbsoluteDifference'])
    for change in changes[:5]:
        print(' ', change)

for path in sorted(native.glob('*.svg')):
    counterpart = browser / path.name
    if not counterpart.exists():
        continue
    a,b = path.read_text(),counterpart.read_text()
    operations = []
    alines,blines = a.splitlines(keepends=True),b.splitlines(keepends=True)
    for kind, i, j, k, l in difflib.SequenceMatcher(None,alines,blines,autojunk=False).get_opcodes():
        if kind != 'equal':
            before,after = ''.join(alines[i:j]),''.join(blines[k:l])
            start = 0
            while start < min(len(before),len(after)) and before[start] == after[start]: start += 1
            end = 0
            while end < min(len(before)-start,len(after)-start) and before[-end-1] == after[-end-1]: end += 1
            operations.append({'kind':kind,'nativeLine':i+1,'browserLine':k+1,
                'native':before[start:len(before)-end if end else None],
                'browser':after[start:len(after)-end if end else None]})
    ar,br = ET.fromstring(a),ET.fromstring(b)
    # Independently compare every element and attribute, keeping the root style difference explicit.
    a_nodes,b_nodes = list(ar.iter()),list(br.iter())
    node_differences = []
    for index,(an,bn) in enumerate(zip(a_nodes,b_nodes)):
        if an.tag != bn.tag or an.attrib != bn.attrib or an.text != bn.text or an.tail != bn.tail:
            node_differences.append({'index':index,'tag':an.tag,
                'nativeAttributes':an.attrib,'browserAttributes':bn.attrib,
                'textIdentical':an.text==bn.text,'tailIdentical':an.tail==bn.tail})
    result = {'nativeCharacters':len(a),'browserCharacters':len(b),'edits':operations,
              'nativeElementCount':len(a_nodes),'browserElementCount':len(b_nodes),'differentElements':node_differences}
    report['svg'][path.stem] = result
    print(path.name, ':', len(operations), 'text edits;', len(node_differences),'differing XML elements;',operations)

destination = pathlib.Path(sys.argv[3]) if len(sys.argv)>3 else pathlib.Path('/tmp/taprats-parity/diagnostic-comparison.json')
destination.write_text(json.dumps(report,indent=2)+'\n')
print('Full evidence:', destination)
