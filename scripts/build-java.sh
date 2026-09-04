#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p .cache java-build/bridge
if [ -n "${JAVA_HOME:-}" ]; then
 TAPRATS_JAVA="$JAVA_HOME/bin/java"
elif [ -x '/Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home/bin/java' ]; then
 TAPRATS_JAVA='/Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home/bin/java'
else
 TAPRATS_JAVA=java
fi
if [ ! -f .cache/ecj-3.26.0.jar ]; then
 curl -fsSL https://repo.maven.apache.org/maven2/org/eclipse/jdt/ecj/3.26.0/ecj-3.26.0.jar -o .cache/ecj-3.26.0.jar
fi
node --input-type=module -e 'import fs from "node:fs";import crypto from "node:crypto";if(crypto.createHash("sha256").update(fs.readFileSync(".cache/ecj-3.26.0.jar")).digest("hex")!=="ac0ba5876eaf7ebb47749a0d1be179c51f194b9dd0b875d1c09e1b530f5a2db5")throw Error("Compiler checksum mismatch")'
"$TAPRATS_JAVA" -jar .cache/ecj-3.26.0.jar -source 1.8 -target 1.8 -cp public/taprats.jar -d java-build/bridge java/taprats/web/BrowserBridge.java
python3 - <<'PY'
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED,ZipInfo
with ZipFile('public/browser-bridge.jar','w',ZIP_DEFLATED) as archive:
 for file in sorted(Path('java-build/bridge').rglob('*.class')):
  info=ZipInfo(str(file.relative_to('java-build/bridge')),date_time=(2026,9,4,0,0,0));info.compress_type=ZIP_DEFLATED
  archive.writestr(info,file.read_bytes())
PY
