import csk.taprats.geometry.Point;
import csk.taprats.geometry.Transform;
import csk.taprats.style.Emboss;
import csk.taprats.style.Interlace;
import csk.taprats.style.Style;
import csk.taprats.toolkit.GeoDraw;
import csk.taprats.toolkit.GeoGraphics;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.Stroke;
import java.io.*;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.*;

/** Optional diagnostics only: does not modify parity expectations or original application classes. */
public class DiagnosticHarness {
    private static final Transform DRAW = new Transform(37.1, 0, 117.3, 0, -37.1, 119.7);
    private static final String[] STYLES = {"Plain", "Sketch", "Thick", "Outline", "Filled", "Interlace", "Emboss"};

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

    private static Object field(Object object, String name) throws Exception {
        for (Class<?> type = object.getClass(); type != null; type = type.getSuperclass()) {
            try {
                Field field = type.getDeclaredField(name);
                field.setAccessible(true);
                return field.get(object);
            } catch (NoSuchFieldException missing) { }
        }
        throw new NoSuchFieldException(name);
    }

    private static String decimal(double value) {
        return Double.isInfinite(value) || Double.isNaN(value) ? quote(Double.toString(value)) : Double.toString(value);
    }

    /** A JSON dump containing the exact ordered integer draw commands and their unrounded source points. */
    public static String dumpExampleLayer(String resource, int index) throws Exception {
        if (!resource.startsWith("examples/")) resource = "examples/" + resource;
        if (!resource.endsWith(".tap")) resource += ".tap";
        InputStream input = DiagnosticHarness.class.getClassLoader().getResourceAsStream(resource);
        if (input == null) throw new FileNotFoundException(resource);
        ObjectInputStream stream = new ObjectInputStream(input);
        Vector<?> layers = (Vector<?>)stream.readObject();
        stream.close();
        Style style = (Style)layers.elementAt(index);
        Recorder drawing = new Recorder();
        style.draw(new GeoGraphics(drawing, DRAW, null));
        StringBuilder out = new StringBuilder("{\"resource\":" + quote(resource) + ",\"layer\":" + index
            + ",\"style\":" + quote(style.getClass().getSimpleName())
            + ",\"vertices\":" + style.getMap().numVertices() + ",\"edges\":" + style.getMap().numEdges()
            + ",\"commands\":[");
        for (int i = 0; i < drawing.commands.size(); i++) {
            if (i > 0) out.append(',');
            out.append(quote(drawing.commands.get(i)));
        }
        out.append("],\"sourcePoints\":[");
        Point[] points = (Point[])field(style, "pts");
        for (int i = 0; i < points.length; i++) {
            if (i > 0) out.append(',');
            out.append('[').append(decimal(points[i].getX())).append(',').append(decimal(points[i].getY())).append(']');
        }
        out.append(']');
        if (style instanceof Emboss) {
            double lx = ((Double)field(style, "light_x")).doubleValue();
            double ly = ((Double)field(style, "light_y")).doubleValue();
            out.append(",\"light\":[").append(decimal(lx)).append(',').append(decimal(ly)).append(']');
            out.append(",\"palette\":[");
            Color[] palette = (Color[])field(style, "greys");
            for (int i = 0; i < palette.length; i++) { if (i > 0) out.append(','); out.append(palette[i].getRGB()); }
            out.append("],\"shadeValues\":[");
            for (int i = 0; i < points.length; i += 6) {
                if (i > 0) out.append(',');
                out.append(decimal(shade(points[i + 1], points[i + 4], lx, ly))).append(',')
                    .append(decimal(shade(points[i + 4], points[i + 1], lx, ly)));
            }
            out.append(']');
        }
        if (style instanceof Interlace) {
            boolean[] shadows = (boolean[])field(style, "shadows");
            out.append(",\"shadows\":[");
            for (int i = 0; i < shadows.length; i++) { if (i > 0) out.append(','); out.append(shadows[i]); }
            out.append("],\"shadowPolygons\":[");
            Method shadowVector = Interlace.class.getDeclaredMethod("getShadowVector", Integer.TYPE, Integer.TYPE);
            shadowVector.setAccessible(true);
            boolean first = true;
            for (int i = 0; i < points.length; i += 6) {
                if (shadows[i / 3]) {
                    if (!first) out.append(','); first = false;
                    Point[] polygon = {
                        points[i+2].add((Point)shadowVector.invoke(style, Integer.valueOf(i+2), Integer.valueOf(i+3))),
                        points[i+2], points[i],
                        points[i].add((Point)shadowVector.invoke(style, Integer.valueOf(i), Integer.valueOf(i+5)))
                    };
                    appendPolygon(out, polygon);
                }
                if (shadows[i / 3 + 1]) {
                    if (!first) out.append(','); first = false;
                    Point[] polygon = {
                        points[i+3].add((Point)shadowVector.invoke(style, Integer.valueOf(i+3), Integer.valueOf(i+2))),
                        points[i+3], points[i+5],
                        points[i+5].add((Point)shadowVector.invoke(style, Integer.valueOf(i+5), Integer.valueOf(i)))
                    };
                    appendPolygon(out, polygon);
                }
            }
            out.append(']');
        }
        return out.append('}').toString();
    }

    private static void appendPolygon(StringBuilder out, Point[] polygon) {
        out.append('[');
        for (int i = 0; i < polygon.length; i++) {
            if (i > 0) out.append(',');
            out.append('[').append(decimal(polygon[i].getX())).append(',').append(decimal(polygon[i].getY())).append(']');
        }
        out.append(']');
    }

    private static double shade(Point a, Point b, double lx, double ly) {
        Point direction = a.subtract(b);
        direction.perpD(); direction.normalizeD();
        return 16.0 * (0.5 * (direction.getX() * lx + direction.getY() * ly + 1.0));
    }

    /** The complete original Batik output, with no normalization applied. */
    public static String dumpSVG(int index) throws Exception {
        Method fixture = Class.forName("ParityHarness").getDeclaredMethod("style", Integer.TYPE);
        fixture.setAccessible(true);
        Style style = (Style)fixture.invoke(null, Integer.valueOf(index));
        Class<?> implementationClass = Class.forName("org.apache.batik.dom.GenericDOMImplementation");
        org.w3c.dom.DOMImplementation implementation = (org.w3c.dom.DOMImplementation)
            implementationClass.getMethod("getDOMImplementation").invoke(null);
        org.w3c.dom.Document document = implementation.createDocument("http://www.w3.org/2000/svg", "svg", null);
        Class<?> graphicsClass = Class.forName("org.apache.batik.svggen.SVGGraphics2D");
        Graphics2D graphics = (Graphics2D)graphicsClass.getConstructor(org.w3c.dom.Document.class).newInstance(document);
        graphicsClass.getMethod("setSVGCanvasSize", java.awt.Dimension.class).invoke(graphics, new java.awt.Dimension(240, 240));
        style.draw(new GeoGraphics(graphics, DRAW, null));
        StringWriter writer = new StringWriter();
        graphicsClass.getMethod("stream", Writer.class, Boolean.TYPE).invoke(graphics, writer, Boolean.TRUE);
        graphics.dispose();
        return writer.toString();
    }

    private static void write(File directory, String name, String value) throws Exception {
        Writer writer = new OutputStreamWriter(new FileOutputStream(new File(directory, name)), "UTF-8");
        writer.write(value); writer.close();
        System.out.println(name + " " + value.length() + " characters");
    }

    public static void main(String[] args) throws Exception {
        File directory = new File(args.length == 0 ? "/tmp/taprats-parity/diagnostics/native" : args[0]);
        directory.mkdirs();
        write(directory, "ochre.json", dumpExampleLayer("Ochre Silicate", 1));
        write(directory, "honey.json", dumpExampleLayer("Tangle Honey", 2));
        write(directory, "spiky.json", dumpExampleLayer("Spiky xmas", 2));
        for (int i = 0; i < STYLES.length; i++) write(directory, STYLES[i] + ".svg", dumpSVG(i));
    }

    private static class Recorder implements GeoDraw {
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
            return type + "/" + color.getRGB() + "/" + Math.round(s.getLineWidth() * 10000000.0)
                + "/" + s.getEndCap() + "/" + s.getLineJoin() + ":";
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
    }
}
