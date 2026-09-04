import csk.taprats.app.*;
import csk.taprats.geometry.Edge;
import csk.taprats.geometry.Map;
import csk.taprats.geometry.Point;
import csk.taprats.geometry.Polygon;
import csk.taprats.geometry.Transform;
import csk.taprats.geometry.Vertex;
import csk.taprats.style.*;
import csk.taprats.tile.*;
import csk.taprats.toolkit.*;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.Stroke;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.*;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;

/** Runs the unchanged Taprats classes. All output is deterministic and machine-readable. */
public class ParityHarness {
    private interface Check { String run() throws Exception; }
    private static final Polygon BOUNDARY = new Polygon(new Point[] {
        new Point(-1.25, -1.25), new Point(1.25, -1.25),
        new Point(1.25, 1.25), new Point(-1.25, 1.25)
    });
    private static final Transform DRAW_TRANSFORM = new Transform(37.1, 0, 117.3, 0, -37.1, 119.7);
    private final TreeMap<String, String> records = new TreeMap<String, String>();
    private int passed;
    private int issues;

    private void check(String name, Check check) {
        try {
            records.put(name, "{\"status\":\"pass\",\"value\":" + quote(check.run()) + "}");
            passed++;
        } catch (Throwable error) {
            records.put(name, "{\"status\":\"original-issue\",\"error\":"
                + quote(error.getClass().getName() + ": " + error.getMessage()) + "}");
            issues++;
        }
    }

    private String finish(String suite) {
        StringBuilder out = new StringBuilder("{\"suite\":" + quote(suite)
            + ",\"passed\":" + passed + ",\"originalIssues\":" + issues + ",\"records\":{");
        boolean first = true;
        for (java.util.Map.Entry<String,String> entry : records.entrySet()) {
            if (!first) out.append(',');
            first = false;
            out.append(quote(entry.getKey())).append(':').append(entry.getValue());
        }
        return out.append("}}").toString();
    }

    private static String quote(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\\' || c == '"') out.append('\\').append(c);
            else if (c == '\n') out.append("\\n");
            else if (c == '\r') out.append("\\r");
            else if (c == '\t') out.append("\\t");
            else if (c < 32) out.append(' ');
            else out.append(c);
        }
        return out.append('"').toString();
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }

    private static String hash(String value) throws Exception {
        CRC32 crc = new CRC32();
        crc.update(value.getBytes("UTF-8"));
        return Long.toHexString(crc.getValue());
    }

    private static String sortedHash(Collection<String> records) throws Exception {
        ArrayList<String> sorted = new ArrayList<String>(records);
        Collections.sort(sorted);
        return hash(sorted.toString());
    }

    private static String number(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) return Double.toString(value);
        return Long.toString(Math.round(value * 10000000.0));
    }

    private static String point(Point point) {
        return number(point.getX()) + "," + number(point.getY());
    }

    private static String feature(Feature feature) {
        StringBuilder out = new StringBuilder(feature.isRegular() ? "regular:" : "polygon:");
        for (Point point : feature.getPoints()) out.append(point(point)).append(';');
        return out.toString();
    }

    private static String tiling(Tiling tiling) throws Exception {
        ArrayList<String> placed = new ArrayList<String>();
        for (Iterator<PlacedFeature> it = tiling.getFeatures(); it.hasNext();) {
            PlacedFeature pf = it.next();
            double[] transform = new double[6];
            pf.getTransform().get(transform);
            StringBuilder record = new StringBuilder(feature(pf.getFeature()));
            for (double value : transform) record.append('/').append(number(value));
            placed.add(record.toString());
        }
        return tiling.countFeatures() + ":" + point(tiling.getTrans1()) + ":"
            + point(tiling.getTrans2()) + ":" + sortedHash(placed);
    }

    private static String map(Map map) throws Exception {
        require(map != null, "Map is null");
        ArrayList<String> entries = new ArrayList<String>();
        for (Enumeration<Vertex> vertices = map.getVertices(); vertices.hasMoreElements();)
            entries.add("V" + point(vertices.nextElement().getPosition()));
        for (Enumeration<Edge> edges = map.getEdges(); edges.hasMoreElements();) {
            Edge edge = edges.nextElement();
            String a = point(edge.getV1().getPosition());
            String b = point(edge.getV2().getPosition());
            entries.add("E" + (a.compareTo(b) <= 0 ? a + ":" + b : b + ":" + a));
        }
        return "vertices=" + map.numVertices() + ";edges=" + map.numEdges() + ";crc=" + sortedHash(entries);
    }

    private static Prototype prototype(Tiling tiling) {
        Prototype prototype = new Prototype(tiling);
        for (Iterator<PlacedFeature> it = tiling.getFeatures(); it.hasNext();)
            prototype.addElement(new DesignElement(it.next().getFeature()));
        return prototype;
    }

    private static String prototypeSignature(Prototype prototype) throws Exception {
        ArrayList<String> entries = new ArrayList<String>();
        for (Enumeration<Feature> features = prototype.getFeatures(); features.hasMoreElements();) {
            Feature feature = features.nextElement();
            Figure figure = prototype.getFigure(feature);
            entries.add(feature(feature) + "=" + figure.getClass().getName() + ":" + map(figure.getMap()));
        }
        return prototype.getTiling().getName() + ":" + entries.size() + ":" + sortedHash(entries);
    }

    private static Object roundtrip(Object value) throws Exception {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        ObjectOutputStream out = new ObjectOutputStream(buffer);
        out.writeObject(value);
        out.close();
        ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(buffer.toByteArray()));
        Object copy = in.readObject();
        in.close();
        return copy;
    }

    private void tilings() {
        final ArrayList<String> names = Collections.list(KnownTilings.getTilingNames());
        Collections.sort(names);
        check("catalog/count", new Check() { public String run() { return "" + names.size(); }});
        for (final String name : names) {
            check("tiling/" + name + "/roundtrip", new Check() { public String run() throws Exception {
                Tiling original = KnownTilings.find(name);
                String before = tiling(original);
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                PrintStream output = new PrintStream(buffer, true, "UTF-8");
                original.writeTiling(output);
                Tiling copy = Tiling.readTiling(new StringReader(buffer.toString("UTF-8")));
                require(before.equals(tiling(copy)), "Tiling changed after save/reload");
                KnownTilings.add(original);
                return before;
            }});
            check("tiling/" + name + "/construct", new Check() { public String run() throws Exception {
                Prototype prototype = prototype(KnownTilings.find(name));
                String before = map(prototype.construct(BOUNDARY));
                Prototype copy = (Prototype)roundtrip(prototype);
                require(before.equals(map(copy.construct(BOUNDARY))), "Prototype changed after save/reload");
                return before;
            }});
        }
        check("tiling/invalid-file", new Check() { public String run() throws Exception {
            try { Tiling.readTiling(new StringReader("this is not a tiling")); }
            catch (IOException expected) { return expected.getClass().getName(); }
            throw new IllegalStateException("Invalid file accepted");
        }});
    }

    private static String layersSignature(Vector<?> layers) throws Exception {
        StringBuilder out = new StringBuilder("layers=" + layers.size());
        for (Object value : layers) {
            Style style = (Style)value;
            out.append('|').append(style.getClass().getName()).append(':')
                .append(prototypeSignature(style.getPrototype()));
            if (style instanceof Colored) out.append(";color=").append(((Colored)style).getColor().getRGB());
            if (style instanceof Thick) out.append(";width=").append(number(((Thick)style).getWidth()))
                .append(";outline=").append(((Thick)style).getDrawOutline());
            if (style instanceof Interlace) out.append(";gap=").append(number(((Interlace)style).getGap()))
                .append(";shadow=").append(number(((Interlace)style).getShadow()));
            if (style instanceof Emboss) out.append(";angle=").append(number(((Emboss)style).getAngle()));
            if (style instanceof Filled) out.append(";inside=").append(((Filled)style).getDrawInside())
                .append(";outside=").append(((Filled)style).getDrawOutside());
            out.append(";geo=").append(number(style.getGeoLeft())).append(',').append(number(style.getGeoTop()))
                .append(',').append(number(style.getGeoWidth())).append(',').append(number(style.getGeoTheta()));
        }
        return out.toString();
    }

    private void examples(final boolean render) throws Exception {
        InputStream input = ParityHarness.class.getClassLoader().getResourceAsStream("examples/designs.txt");
        BufferedReader reader = new BufferedReader(new InputStreamReader(input, "UTF-8"));
        ArrayList<String> paths = new ArrayList<String>();
        String path;
        while ((path = reader.readLine()) != null) if (path.endsWith(".tap")) paths.add(path);
        reader.close();
        for (final String resource : paths) {
            check((render ? "example-render/" : "example/") + resource, new Check() { public String run() throws Exception {
                InputStream input = ParityHarness.class.getClassLoader().getResourceAsStream(resource);
                require(input != null, "Missing bundled example");
                ObjectInputStream stream = new ObjectInputStream(input);
                Vector<?> layers = (Vector<?>)stream.readObject();
                stream.close();
                if (render) {
                    StringBuilder result = new StringBuilder("layers=" + layers.size());
                    for (Object value : layers) {
                        Style style = (Style)value;
                        result.append('|').append(style.getClass().getSimpleName()).append(':')
                            .append(map(style.getMap())).append(':').append(draw(style));
                    }
                    return result.toString();
                }
                String before = layersSignature(layers);
                Vector<?> copy = (Vector<?>)roundtrip(layers);
                require(before.equals(layersSignature(copy)), "Design changed after save/reload");
                return before;
            }});
        }
    }

    private void figure(final String name, final Figure figure) {
        check("figure/" + name, new Check() { public String run() throws Exception {
            String before = map(figure.getMap());
            require(before.equals(map(((Figure)figure.clone()).getMap())), "Figure clone changed geometry");
            require(before.equals(map(((Figure)roundtrip(figure)).getMap())), "Figure save/reload changed geometry");
            return before;
        }});
    }

    private void figures() {
        int[] sides = {5, 6, 7, 8, 9, 10, 12, 16, 24};
        for (int n : sides) {
            figure("star/" + n + "/1.5/1", new Star(n, 1.5, 1));
            figure("star/" + n + "/2/2", new Star(n, 2, 2));
            figure("star/" + n + "/max", new Star(n, n / 2.0 - 0.5, (n - 1) / 2));
            for (double q : new double[] {-1, -0.3, 0, 0.6, 1})
                figure("rosette/" + n + "/" + q, new Rosette(n, q, 2));
            figure("scale/" + n + "/0.7", new ScaleFigure(new Rosette(n, 0, 2), 0.7));
            figure("scale/" + n + "/1", new ScaleFigure(new Rosette(n, 0, 2), 1));
            figure("connect/" + n, new ConnectFigure(new Rosette(n, 0, 2)));
        }
        check("figure/setters", new Check() { public String run() throws Exception {
            Star star = new Star(8, 2, 1);
            star.setD(3); star.setS(2);
            Rosette rosette = new Rosette(8, 0, 1);
            rosette.setQ(0.5); rosette.setS(2);
            ScaleFigure scale = new ScaleFigure(rosette, 1); scale.setS(0.8);
            ConnectFigure connect = new ConnectFigure(star); connect.childChanged();
            return map(star.getMap()) + "|" + map(rosette.getMap()) + "|" + map(scale.getMap()) + "|" + map(connect.getMap());
        }});
    }

    private void inference() {
        for (final String name : new String[] {"10", "4.8^2", "csk_7", "4.6.12"}) {
            final Prototype prototype = prototype(KnownTilings.find(name));
            ArrayList<Feature> features = Collections.list(prototype.getFeatures());
            Collections.sort(features, new Comparator<Feature>() { public int compare(Feature a, Feature b) {
                return feature(a).compareTo(feature(b));
            }});
            for (int i = 0; i < features.size(); i++) {
                final Feature feature = features.get(i);
                for (int j = 0; j < 8; j++) {
                    final int method = j;
                    check("inference/" + name + "/feature-" + i + "/method-" + method, new Check() { public String run() throws Exception {
                        Infer infer = new Infer(prototype);
                        Map result;
                        switch (method) {
                            case 0: result = infer.infer(feature); break;
                            case 1: result = infer.inferStar(feature, 2, 1); break;
                            case 2: result = infer.inferGirih(feature, 10, 3); break;
                            case 3: result = infer.inferIntersect(feature, 10, 3, 1); break;
                            case 4: result = infer.inferIntersectProgressive(feature, 10, 3, 1); break;
                            case 5: result = infer.inferHourglass(feature, 2, 1); break;
                            case 6: result = infer.inferRosette(feature, 0, 1, 0.5); break;
                            default: result = infer.inferRosette(feature, 0.5f, 2, 0.75); break;
                        }
                        return map(result);
                    }});
                }
            }
        }
    }

    private static Style style(int index) {
        Prototype prototype = prototype(KnownTilings.find("4.8^2"));
        for (Enumeration<Feature> it = prototype.getFeatures(); it.hasMoreElements();) {
            Feature feature = it.nextElement();
            prototype.addElement(new DesignElement(feature, feature.isRegular() && feature.numPoints() == 8
                ? new Star(8, 3, 2) : new ExplicitFigure(new Map())));
        }
        switch (index) {
            case 0: return new Plain(prototype, BOUNDARY);
            case 1: return new Sketch(prototype, BOUNDARY);
            case 2: return new Thick(prototype, BOUNDARY);
            case 3: return new Outline(prototype, BOUNDARY);
            case 4: return new Filled(prototype, BOUNDARY);
            case 5: return new Interlace(prototype, BOUNDARY);
            default: return new Emboss(prototype, BOUNDARY);
        }
    }

    private static String draw(Style style) throws Exception {
        RecordingDraw drawing = new RecordingDraw();
        style.draw(new GeoGraphics(drawing, DRAW_TRANSFORM, null));
        return drawing.signature();
    }

    private static void configure(Style style) {
        if (style instanceof Colored) ((Colored)style).setColor(new Color(58, 109, 173));
        if (style instanceof Thick) { ((Thick)style).setWidth(0.09); ((Thick)style).setDrawOutline(false); }
        if (style instanceof Interlace) { ((Interlace)style).setGap(0.04); ((Interlace)style).setShadow(0.15); }
        if (style instanceof Emboss) ((Emboss)style).setAngle(1.2);
        if (style instanceof Filled) { ((Filled)style).setDrawInside(false); ((Filled)style).setDrawOutside(true); }
    }

    private void styles() {
        for (int i = 0; i < 7; i++) {
            final int index = i;
            final String name = style(i).getClass().getSimpleName();
            check("style/" + name + "/default", new Check() { public String run() throws Exception {
                Style style = style(index);
                String before = draw(style);
                require(before.equals(draw((Style)style.clone())), "Style clone changed drawing");
                require(before.equals(draw((Style)roundtrip(style))), "Style save/reload changed drawing");
                return before;
            }});
            check("style/" + name + "/settings", new Check() { public String run() throws Exception {
                Style style = style(index);
                configure(style);
                String before = draw(style);
                require(before.equals(draw((Style)roundtrip(style))), "Style settings changed after save/reload");
                style.setHidden(true);
                require(draw(style).startsWith("operations=0;"), "Hidden style still draws");
                style.setHidden(false);
                require(before.equals(draw(style)), "Unhide changed drawing");
                return before;
            }});
            check("export/" + name + "/eps", new Check() { public String run() throws Exception {
                File file = File.createTempFile("taprats-parity-", ".eps");
                try {
                    GeoDrawEPS eps = new GeoDrawEPS(file);
                    style(index).draw(new GeoGraphics(eps, DRAW_TRANSFORM, null));
                    eps.close();
                    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                    InputStream in = new FileInputStream(file);
                    byte[] bytes = new byte[8192];
                    for (int length; (length = in.read(bytes)) != -1;) buffer.write(bytes, 0, length);
                    in.close();
                    String text = buffer.toString("UTF-8");
                    require(text.startsWith("%!PS-Adobe-3.0 EPSF-3.0") && text.contains("%%BoundingBox:") && text.contains("grestore"), "EPS export incomplete");
                    return "bytes=" + buffer.size() + ";crc=" + hash(text);
                } finally { file.delete(); }
            }});
            for (final String format : new String[] {"png", "jpg"}) {
                check("export/" + name + "/" + format, new Check() { public String run() throws Exception {
                    BufferedImage image = new BufferedImage(240, 240, BufferedImage.TYPE_INT_RGB);
                    Graphics2D graphics = image.createGraphics();
                    graphics.setColor(Color.WHITE); graphics.fillRect(0, 0, 240, 240);
                    style(index).draw(new GeoGraphics(graphics, DRAW_TRANSFORM, null));
                    graphics.dispose();
                    int changed = 0;
                    for (int y = 0; y < 240; y++) for (int x = 0; x < 240; x++) if (image.getRGB(x,y) != Color.WHITE.getRGB()) changed++;
                    require(changed > 0, "Rendered image is blank");
                    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                    require(ImageIO.write(image, format, buffer), "Image writer missing: " + format);
                    BufferedImage reloaded = ImageIO.read(new ByteArrayInputStream(buffer.toByteArray()));
                    require(reloaded != null && reloaded.getWidth() == 240 && reloaded.getHeight() == 240, "Image export cannot be reopened");
                    if (format.equals("png")) for (int y = 0; y < 240; y++) for (int x = 0; x < 240; x++)
                        require(image.getRGB(x,y) == reloaded.getRGB(x,y), "PNG roundtrip changed pixels");
                    // Raster antialiasing and encoder bytes vary across JVMs. Geometry is checked separately.
                    return "width=240;height=240;nonblank=true;reopened=true";
                }});
            }
        }
        check("export/svg-dependency", new Check() { public String run() {
            try { Class.forName("org.apache.batik.svggen.SVGGraphics2D"); return "batik-present"; }
            catch (ClassNotFoundException expected) { return "batik-absent-in-original-distribution"; }
        }});
    }

    private void layers() {
        check("layers/reorder-clone-remove", new Check() { public String run() throws Exception {
            GeoLayeredView view = new GeoLayeredView(-2, 2, 4);
            view.setSize(400, 300);
            Style a = style(0), b = style(2), c = style(5);
            view.add(a); view.add(b); view.insert(c, 1);
            require(view.countLayers() == 3 && view.get(0) == b && view.get(1) == c && view.get(2) == a, "Layer insertion order");
            view.moveDown(0); view.moveUp(2);
            require(view.get(0) == c && view.get(1) == a && view.get(2) == b, "Layer reorder");
            Style d = (Style)c.clone(); view.replace(c, d);
            require(view.get(0) == d, "Layer replacement");
            a.setGeoBounds(-1.5, 1.25, 3.5); a.setGeoTheta(0.35);
            view.setActiveLayer(a);
            String geometry = point(a.screenToWorld(110, 170));
            view.setActiveLayer(null); view.remove(b);
            require(view.countLayers() == 2, "Layer removal");
            String saved = layersSignature(view.getLayers());
            Vector<?> reopened = (Vector<?>)roundtrip(view.getLayers());
            // Reattach to an equal viewport before comparing absolute coordinates.
            GeoLayeredView copy = new GeoLayeredView(-2, 2, 4); copy.setSize(400, 300);
            for (Object layer : reopened) copy.insert((GeoLayer)layer, copy.countLayers());
            require(saved.equals(layersSignature(copy.getLayers())), "Layers changed after save/reload");
            view.removeAll(); require(view.countLayers() == 0, "Remove all layers");
            return geometry + ";saved=" + hash(saved);
        }});
    }

    /** Optional extension verification; excluded from the original-distribution baseline. */
    private void svg() {
        for (int i = 0; i < 7; i++) {
            final int index = i;
            final String name = style(i).getClass().getSimpleName();
            check("svg/" + name, new Check() { public String run() throws Exception {
                Class<?> implementationClass = Class.forName("org.apache.batik.dom.GenericDOMImplementation");
                org.w3c.dom.DOMImplementation implementation = (org.w3c.dom.DOMImplementation)
                    implementationClass.getMethod("getDOMImplementation").invoke(null);
                org.w3c.dom.Document document = implementation.createDocument("http://www.w3.org/2000/svg", "svg", null);
                Class<?> graphicsClass = Class.forName("org.apache.batik.svggen.SVGGraphics2D");
                Graphics2D graphics = (Graphics2D)graphicsClass.getConstructor(org.w3c.dom.Document.class).newInstance(document);
                graphicsClass.getMethod("setSVGCanvasSize", java.awt.Dimension.class).invoke(graphics, new java.awt.Dimension(240, 240));
                style(index).draw(new GeoGraphics(graphics, DRAW_TRANSFORM, null));
                StringWriter writer = new StringWriter();
                graphicsClass.getMethod("stream", Writer.class, Boolean.TYPE).invoke(graphics, writer, Boolean.TRUE);
                graphics.dispose();
                String text = writer.toString();
                require(text.contains("<svg") && text.contains("http://www.w3.org/2000/svg") && text.matches("(?s).*</svg\\s*>\\s*"), "SVG document incomplete");
                require(text.contains("<path") || text.contains("<line") || text.contains("<polygon"), "SVG has no drawing geometry");
                return "characters=" + text.length() + ";crc=" + hash(text);
            }});
        }
    }

    /** Individual suites support progress reporting and isolate expensive rendering checks. */
    public static String runSuite(String suite) {
        ParityHarness harness = new ParityHarness();
        try {
            if (suite.equals("tilings") || suite.equals("all")) harness.tilings();
            if (suite.equals("examples") || suite.equals("all")) harness.examples(false);
            if (suite.equals("examples-render") || suite.equals("all")) harness.examples(true);
            if (suite.equals("figures") || suite.equals("all")) harness.figures();
            if (suite.equals("inference") || suite.equals("all")) harness.inference();
            if (suite.equals("styles") || suite.equals("all")) harness.styles();
            if (suite.equals("layers") || suite.equals("all")) harness.layers();
            if (suite.equals("svg")) harness.svg();
        } catch (final Throwable error) {
            harness.check("suite-error", new Check() { public String run() throws Exception { throw new Exception(error); }});
        }
        return harness.finish(suite);
    }

    public static String run() { return runSuite("all"); }
    public static void main(String[] args) { System.out.println(runSuite(args.length == 0 ? "all" : args[0])); }

    private static class RecordingDraw implements GeoDraw {
        private Color color = Color.BLACK;
        private Stroke stroke = new BasicStroke(1);
        private final ArrayList<String> commands = new ArrayList<String>();
        public Stroke getStroke() { return stroke; }
        public void setStroke(Stroke value) { stroke = value; }
        public void dispose() {}
        public Color getColor() { return color; }
        public void setColor(Color value) { color = value; }
        private String prefix(String type) {
            BasicStroke s = (BasicStroke)stroke;
            return type + "/" + color.getRGB() + "/" + number(s.getLineWidth()) + "/" + s.getEndCap() + "/" + s.getLineJoin() + ":";
        }
        public void drawLine(int x1, int y1, int x2, int y2) {
            String a = x1 + "," + y1, b = x2 + "," + y2;
            commands.add(prefix("line") + (a.compareTo(b) < 0 ? a + ";" + b : b + ";" + a));
        }
        private void polygon(String type, int[] xs, int[] ys, int n) {
            StringBuilder command = new StringBuilder(prefix(type));
            for (int i = 0; i < n; i++) command.append(xs[i]).append(',').append(ys[i]).append(';');
            commands.add(command.toString());
        }
        public void fillPolygon(int[] x, int[] y, int n) { polygon("fillPolygon", x, y, n); }
        public void drawPolygon(int[] x, int[] y, int n) { polygon("drawPolygon", x, y, n); }
        public void fillOval(int x, int y, int w, int h) { commands.add(prefix("fillOval") + x + "," + y + "," + w + "," + h); }
        public void drawOval(int x, int y, int w, int h) { commands.add(prefix("drawOval") + x + "," + y + "," + w + "," + h); }
        public String signature() throws Exception { return "operations=" + commands.size() + ";crc=" + sortedHash(commands); }
    }
}
