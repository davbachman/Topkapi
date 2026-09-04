package taprats.testing;

import java.awt.*;
import java.awt.event.*;
import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.Callable;
import javax.swing.*;
import javax.swing.text.JTextComponent;
import csk.taprats.app.*;
import csk.taprats.tile.*;
import csk.taprats.style.*;
import csk.taprats.toolkit.*;
import csk.taprats.ui.MainWindow;
import csk.taprats.ui.tile.*;
import csk.taprats.ui.figure.*;
import csk.taprats.ui.toolkit.*;

/** Test-only bridge. Always uses the original widgets/actions/algorithms. */
public final class UIHarness {
    private static final IdentityHashMap<Object,Integer> ids = new IdentityHashMap<Object,Integer>();
    private static final HashMap<Integer,Object> objects = new HashMap<Integer,Object>();
    private static int nextId = 1;
    private static volatile int queued, completed;
    private static volatile String lastOperation = "", lastError = "";
    private interface Job { void run() throws Exception; }
    private static String q(Object value) {
        if (value == null) return "null";
        String s=String.valueOf(value); StringBuilder b=new StringBuilder("\"");
        for(int i=0;i<s.length();i++){char c=s.charAt(i);switch(c){case '\\':b.append("\\\\");break;case '"':b.append("\\\"");break;case '\n':b.append("\\n");break;case '\r':b.append("\\r");break;case '\t':b.append("\\t");break;default:if(c<32)b.append(String.format("\\u%04x",(int)c));else b.append(c);}}
        return b.append('"').toString();
    }
    private static int id(Object o){if(o==null)return 0;Integer i=ids.get(o);if(i==null){i=nextId++;ids.put(o,i);objects.put(i,o);}return i;}
    private static Object object(int i){Object o=objects.get(i);if(o==null)throw new IllegalArgumentException("Unknown ID "+i+"; call snapshot/state first");return o;}
    private static Object field(Object o,String name)throws Exception{if(o==null)throw new IllegalStateException("Missing owner for "+name);for(Class<?> c=o.getClass();c!=null;c=c.getSuperclass()){try{Field f=c.getDeclaredField(name);f.setAccessible(true);return f.get(o);}catch(NoSuchFieldException e){}}throw new NoSuchFieldException(o.getClass().getName()+"."+name);}
    private static Object path(Object o,String p)throws Exception{for(String x:p.split("\\."))o=field(o,x);return o;}
    private static void check(boolean ok,String why){if(!ok)throw new IllegalStateException(why);}
    private static String edt(final Callable<String> c){try{if(SwingUtilities.isEventDispatchThread())return c.call();final String[] result=new String[1];final Throwable[] error=new Throwable[1];SwingUtilities.invokeAndWait(new Runnable(){public void run(){try{result[0]=c.call();}catch(Throwable e){error[0]=e;}}});if(error[0]!=null)throw new RuntimeException(error[0]);return result[0];}catch(Throwable e){return "{\"error\":"+q(e.toString())+"}";}}
    private static String schedule(final String name,final Job j){final int ticket=++queued;SwingUtilities.invokeLater(new Runnable(){public void run(){lastOperation=name;lastError="";try{j.run();}catch(Throwable e){lastError=e.toString();e.printStackTrace();}finally{completed=Math.max(completed,ticket);}}});return "{\"scheduled\":"+ticket+",\"operation\":"+q(name)+"}";}
    private static ArrayList<Window> windows(){ArrayList<Window> a=new ArrayList<Window>();for(Frame f:Frame.getFrames())addWindow(a,f);return a;}
    private static void addWindow(ArrayList<Window>a,Window w){if(a.contains(w))return;a.add(w);for(Window x:w.getOwnedWindows())addWindow(a,x);}
    private static <T> T find(Component c,Class<T> t){if(t.isInstance(c))return t.cast(c);if(c instanceof Container)for(Component x:((Container)c).getComponents()){T v=find(x,t);if(v!=null)return v;}return null;}
    private static <T> T active(Class<T> t){for(Window w:windows())if(w.isShowing()){T v=find(w,t);if(v!=null)return v;}throw new IllegalStateException("No showing "+t.getSimpleName());}
    private static MainWindow main(){return active(MainWindow.class);}
    private static GeoLayeredView view()throws Exception{return (GeoLayeredView)field(main(),"layered_view");}
    private static LayersEditor layersEditor()throws Exception{return (LayersEditor)field(main(),"layers_editor");}
    private static void button(Object owner,String name)throws Exception{((AbstractButton)field(owner,name)).doClick(0);}
    private static void perform(Action a,Object source){a.actionPerformed(new ActionEvent(source,ActionEvent.ACTION_PERFORMED,"test"));}
    private static String label(Object o){if(o instanceof Tiling)return ((Tiling)o).getName();return String.valueOf(o);}
    private static String items(ListModel<?> m){StringBuilder b=new StringBuilder("[");for(int i=0;i<m.getSize();i++){if(i>0)b.append(',');b.append(q(label(m.getElementAt(i))));}return b.append(']').toString();}
    private static String title(Window w){if(w instanceof Frame)return ((Frame)w).getTitle();if(w instanceof Dialog)return ((Dialog)w).getTitle();return "";}
    private static void tree(StringBuilder b,Component c){
        b.append("{\"id\":").append(id(c)).append(",\"class\":").append(q(c.getClass().getName())).append(",\"visible\":").append(c.isVisible()).append(",\"showing\":").append(c.isShowing()).append(",\"enabled\":").append(c.isEnabled());
        Rectangle r=c.getBounds();b.append(",\"bounds\":[").append(r.x).append(',').append(r.y).append(',').append(r.width).append(',').append(r.height).append(']');
        if(c.isShowing())try{java.awt.Point p=c.getLocationOnScreen();b.append(",\"screen\":[").append(p.x).append(',').append(p.y).append(',').append(r.width).append(',').append(r.height).append(']');}catch(Exception e){}
        if(c.getName()!=null)b.append(",\"name\":").append(q(c.getName()));
        if(c instanceof Window)b.append(",\"title\":").append(q(title((Window)c)));
        if(c instanceof Dialog)b.append(",\"modal\":").append(((Dialog)c).isModal());
        if(c instanceof AbstractButton){AbstractButton x=(AbstractButton)c;b.append(",\"text\":").append(q(x.getText())).append(",\"selected\":").append(x.isSelected());}
        else if(c instanceof JLabel)b.append(",\"text\":").append(q(((JLabel)c).getText()));
        else if(c instanceof JTextComponent)b.append(",\"text\":").append(q(((JTextComponent)c).getText())).append(",\"editable\":").append(((JTextComponent)c).isEditable());
        else if(c instanceof java.awt.Button)b.append(",\"text\":").append(q(((java.awt.Button)c).getLabel()));
        if(c instanceof JComboBox){JComboBox<?> x=(JComboBox<?>)c;b.append(",\"selectedIndex\":").append(x.getSelectedIndex()).append(",\"items\":").append(items(x.getModel()));}
        if(c instanceof JList){JList<?> x=(JList<?>)c;b.append(",\"selectedIndex\":").append(x.getSelectedIndex()).append(",\"items\":").append(items(x.getModel()));}
        if(c instanceof JScrollBar){JScrollBar x=(JScrollBar)c;b.append(",\"value\":").append(x.getValue()).append(",\"min\":").append(x.getMinimum()).append(",\"max\":").append(x.getMaximum());}
        if(c instanceof JComponent){String tip=((JComponent)c).getToolTipText();if(tip!=null)b.append(",\"tooltip\":").append(q(tip));}
        if(c instanceof Container){b.append(",\"children\":[");Component[] cs=((Container)c).getComponents();for(int i=0;i<cs.length;i++){if(i>0)b.append(',');tree(b,cs[i]);}b.append(']');}
        if(c instanceof Frame){MenuBar m=((Frame)c).getMenuBar();if(m!=null){b.append(",\"menus\":[");for(int i=0;i<m.getMenuCount();i++){if(i>0)b.append(',');menu(b,m.getMenu(i));}b.append(']');}}
        b.append('}');
    }
    private static void menu(StringBuilder b,MenuItem m){b.append("{\"id\":").append(id(m)).append(",\"class\":").append(q(m.getClass().getName())).append(",\"text\":").append(q(m.getLabel())).append(",\"enabled\":").append(m.isEnabled());if(m instanceof Menu){Menu x=(Menu)m;b.append(",\"items\":[");for(int i=0;i<x.getItemCount();i++){if(i>0)b.append(',');menu(b,x.getItem(i));}b.append(']');}b.append('}');}
    public static String snapshot(){return edt(new Callable<String>(){public String call(){StringBuilder b=new StringBuilder("{\"queued\":"+queued+",\"completed\":"+completed+",\"lastOperation\":"+q(lastOperation)+",\"lastError\":"+q(lastError)+",\"windows\":[");boolean first=true;for(Window w:windows())if(w.isShowing()){if(!first)b.append(',');first=false;tree(b,w);}return b.append("]}").toString();}});}
    public static String fieldId(final int ownerId,final String name){return edt(new Callable<String>(){public String call()throws Exception{return "{\"id\":"+id(path(object(ownerId),name))+"}";}});}
    public static String click(final int i){return schedule("click "+i,new Job(){public void run(){Object o=object(i);if(o instanceof AbstractButton){AbstractButton b=(AbstractButton)o;check(b.isEnabled(),"Disabled button");b.doClick(0);}else if(o instanceof MenuItem){for(ActionListener a:((MenuItem)o).getActionListeners())a.actionPerformed(new ActionEvent(o,1001,"test"));}else if(o instanceof Component){Component c=(Component)o;long t=System.currentTimeMillis();int x=c.getWidth()/2,y=c.getHeight()/2;c.dispatchEvent(new MouseEvent(c,MouseEvent.MOUSE_PRESSED,t,InputEvent.BUTTON1_DOWN_MASK,x,y,1,false,1));c.dispatchEvent(new MouseEvent(c,MouseEvent.MOUSE_RELEASED,t+1,0,x,y,1,false,1));c.dispatchEvent(new MouseEvent(c,MouseEvent.MOUSE_CLICKED,t+2,0,x,y,1,false,1));}else throw new IllegalArgumentException("Not clickable: "+o);}});}
    public static String setText(final int i,final String value){return schedule("setText "+i,new Job(){public void run(){Object o=object(i);if(o instanceof JTextComponent){((JTextComponent)o).setText(value);if(o instanceof JTextField)((JTextField)o).postActionEvent();}else if(o instanceof TextComponent)((TextComponent)o).setText(value);else throw new IllegalArgumentException("Not text input");}});}
    public static String select(final int i,final int index){return schedule("select "+i+" "+index,new Job(){public void run(){Object o=object(i);if(o instanceof JComboBox)((JComboBox<?>)o).setSelectedIndex(index);else if(o instanceof JList){((JList<?>)o).setSelectedIndex(index);((JList<?>)o).ensureIndexIsVisible(index);}else if(o instanceof JTabbedPane)((JTabbedPane)o).setSelectedIndex(index);else if(o instanceof java.awt.Choice)((java.awt.Choice)o).select(index);else throw new IllegalArgumentException("Not selectable");}});}
    public static String setValue(final int i,final int value){return schedule("setValue "+i,new Job(){public void run(){Object o=object(i);if(o instanceof JScrollBar)((JScrollBar)o).setValue(value);else if(o instanceof JSlider)((JSlider)o).setValue(value);else if(o instanceof JSpinner)((JSpinner)o).setValue(value);else throw new IllegalArgumentException("No numeric value");}});}
    public static String close(final int i){return schedule("close "+i,new Job(){public void run(){Window w=(Window)object(i);w.dispatchEvent(new WindowEvent(w,WindowEvent.WINDOW_CLOSING));}});}
    public static String action(final String name){return schedule("main action "+name,new Job(){public void run()throws Exception{String n=name;String[][] names={{"new","new_action"},{"newTiling","new_tiling_action"},{"open","open_action"},{"save","save_action"},{"saveAs","save_as_action"},{"example","select_example_action"},{"image","export_as_image_action"},{"eps","export_as_eps_action"},{"svg","export_as_svg_action"}};for(String[] pair:names)if(pair[0].equals(name))n=pair[1];Action a=(Action)field(main(),n);check(a!=null,"Unavailable action "+name);perform(a,main());}});}
    public static String invokeFieldAction(final int owner,final String fieldName){return schedule("field action "+fieldName,new Job(){public void run()throws Exception{Object o=object(owner);perform((Action)path(o,fieldName),o);}});}
    public static String loadExample(final String name){return schedule("loadExample "+name,new Job(){public void run(){String resource=name.startsWith("examples/")?name:"examples/"+name;if(!resource.endsWith(".tap"))resource+=".tap";java.io.InputStream in=UIHarness.class.getResourceAsStream("/"+resource);check(in!=null,"Missing resource "+resource);main().openLayers(in,name);}});}
    private static String transform(Transformable t){return "{\"left\":"+t.getGeoLeft()+",\"top\":"+t.getGeoTop()+",\"width\":"+t.getGeoWidth()+",\"theta\":"+t.getGeoTheta()+"}";}
    private static String controls(Object o,String[] names)throws Exception{StringBuilder b=new StringBuilder("{");for(int i=0;i<names.length;i++){if(i>0)b.append(',');b.append(q(names[i])).append(':').append(id(path(o,names[i])));}return b.append('}').toString();}
    public static String state(){return edt(new Callable<String>(){public String call()throws Exception{
        MainWindow m=main();GeoLayeredView v=view();LayersEditor l=layersEditor();StringBuilder b=new StringBuilder("{\"queued\":"+queued+",\"completed\":"+completed+",\"lastOperation\":"+q(lastOperation)+",\"lastError\":"+q(lastError)+",\"tilings\":"+KnownTilings.countTilings()+",\"main\":"+id(m)+",\"layerCount\":"+v.countLayers()+",\"view\":"+transform(v)+",\"controls\":");
        b.append(controls(m,new String[]{"layered_view","layers_editor.layers_list","layers_editor.add_button","layers_editor.remove_button","layers_editor.clone_button","layers_editor.up_button","layers_editor.down_button","style_editor.style_choice","transform_all_button","transform_editor.pan_x","transform_editor.pan_y","transform_editor.rot","transform_editor.zoom"}));
        b.append(",\"layers\":[");for(int i=0;i<v.countLayers();i++){if(i>0)b.append(',');Style s=(Style)v.get(i);b.append("{\"id\":").append(id(s)).append(",\"type\":").append(q(s.getClass().getSimpleName())).append(",\"description\":").append(q(s.getDescription())).append(",\"selected\":").append(l.getSelection()==s).append(",\"hidden\":").append(s.isHidden()).append(",\"transform\":").append(transform(s));if(s instanceof Colored)b.append(",\"colorARGB\":").append(((Colored)s).getColor().getRGB());b.append('}');}b.append(']');
        b.append(",\"wizards\":[");boolean first=true;for(Window w:windows())if(w.isShowing()&&w instanceof NewLayerEditor){if(!first)b.append(',');first=false;NewLayerEditor n=(NewLayerEditor)w;DesignEditor e=(DesignEditor)field(n,"editor");FeatureLauncher f=(FeatureLauncher)field(e,"launcher");b.append("{\"id\":").append(id(n)).append(",\"step\":").append(field(n,"current")).append(",\"featureCount\":").append(field(f,"buttons")==null?0:f.numFeatureButtons()).append(",\"controls\":").append(controls(n,new String[]{"next","prev","cancel","selector.tiling_list","editor.launcher","editor.viewer","editor.apply","editor.edit.choice","preview.design"})).append('}');}b.append(']');
        b.append(",\"designers\":[");first=true;for(Window w:windows())if(w.isShowing()&&w instanceof DesignerWindow){if(!first)b.append(',');first=false;DesignerPanel d=(DesignerPanel)field(w,"designer");b.append("{\"id\":").append(id(w)).append(",\"panel\":").append(id(d)).append(",\"features\":").append(d.countFeatures()).append(",\"included\":").append(((Set<?>)field(d,"in_tiling")).size()).append(",\"mode\":").append(field(d,"mouse_mode")).append(",\"transform\":").append(transform(d)).append('}');}return b.append("]}").toString();
    }});}
    public static String layerScenario(){return edt(new Callable<String>(){public String call()throws Exception{
        GeoLayeredView v=view();LayersEditor l=layersEditor();check(v.countLayers()>0,"Load an example first");int count=v.countLayers();GeoLayer original=v.get(0);l.setSelection(original);boolean hidden=original.isHidden();
        button(l,"clone_button");check(v.countLayers()==count+1,"Clone failed");GeoLayer clone=l.getSelection();check(clone!=original,"Clone shares layer identity");check(!clone.hasChanged(original),"Clone altered style/geometry/transform");
        button(l,"down_button");check(v.get(1)==clone,"Down failed");button(l,"up_button");check(v.get(0)==clone,"Up failed");
        JList<?> list=(JList<?>)field(l,"layers_list");// Space is registered as an ActionMap binding.
        KeyStroke key=KeyStroke.getKeyStroke(' ');Object binding=list.getInputMap(JComponent.WHEN_FOCUSED).get(key);Action a=binding==null?null:list.getActionMap().get(binding);check(a!=null,"Space binding absent");perform(a,list);check(clone.isHidden(),"Space failed to hide clone");perform(a,list);check(!clone.isHidden(),"Space failed to show clone");
        button(l,"remove_button");check(v.countLayers()==count,"Remove failed");check(v.get(0)==original&&original.isHidden()==hidden,"Scenario altered original");l.setSelection(original);return "{\"pass\":true,\"checks\":[\"clone\",\"clone equality\",\"down\",\"up\",\"Space hide\",\"Space show\",\"remove\"],\"layerCount\":"+count+"}";
    }});}
    public static String transformScenario(){return edt(new Callable<String>(){public String call()throws Exception{
        MainWindow m=main();GeoLayeredView v=view();check(v.countLayers()>0,"Load an example first");layersEditor().setSelection(v.get(0));JToggleButton all=(JToggleButton)field(m,"transform_all_button");boolean was=all.isSelected();if(!was)all.doClick(0);double left=v.getGeoLeft(),top=v.getGeoTop(),width=v.getGeoWidth(),theta=v.getGeoTheta();Object ed=field(m,"transform_editor");
        JTextField x=(JTextField)field(ed,"pan_x"),y=(JTextField)field(ed,"pan_y"),r=(JTextField)field(ed,"rot"),z=(JTextField)field(ed,"zoom");
        x.setText("2.5");x.postActionEvent();check(Math.abs(v.getGeoLeft()+v.getGeoWidth()/2-2.5)<1e-8,"Pan X failed");y.setText("-1.25");y.postActionEvent();check(Math.abs(v.getGeoTop()-v.getGeoWidth()/2+1.25)<1e-8,"Pan Y failed");r.setText("30");r.postActionEvent();check(Math.abs(v.getGeoTheta()-Math.PI/6)<1e-8,"Rotate failed");z.setText("18");z.postActionEvent();check(Math.abs(v.getGeoWidth()-18)<1e-8,"Zoom field failed");
        v.setGeoBounds(left,top,width);v.setGeoTheta(theta);all.doClick(0);GeoLayer s=v.get(0);double sl=s.getGeoLeft(),st=s.getGeoTop(),sw=s.getGeoWidth(),sr=s.getGeoTheta();r.setText("15");r.postActionEvent();check(Math.abs(s.getGeoTheta()-Math.PI/12)<1e-8,"Selected layer rotate failed");check(v.getGeoTheta()==theta,"Selected transform affected view");s.setGeoBounds(sl,st,sw);s.setGeoTheta(sr);if(was)all.doClick(0);return "{\"pass\":true,\"checks\":[\"numeric pan X/Y\",\"rotation degrees\",\"width zoom\",\"selected layer isolation\",\"restored\"]}";
    }});}
    public static String startWizard(final String tilingName){return schedule("startWizard "+tilingName,new Job(){public void run()throws Exception{button(layersEditor(),"add_button");NewLayerEditor n=active(NewLayerEditor.class);TilingSelector s=(TilingSelector)field(n,"selector");JList<?> list=(JList<?>)field(s,"tiling_list");boolean found=false;for(int i=0;i<list.getModel().getSize();i++)if(tilingName.equals(((Tiling)list.getModel().getElementAt(i)).getName())){list.setSelectedIndex(i);found=true;break;}check(found,"Unknown tiling "+tilingName);button(n,"next");}});}
    public static String wizardFeature(final int index){return schedule("wizardFeature "+index,new Job(){public void run()throws Exception{Object e=field(active(NewLayerEditor.class),"editor");((FeatureLauncher)field(e,"launcher")).setCurrent(index);}});}
    public static String wizardAlgorithm(final String name){return schedule("wizardAlgorithm "+name,new Job(){public void run()throws Exception{Object e=path(active(NewLayerEditor.class),"editor.edit");JComboBox<?> c=(JComboBox<?>)field(e,"choice");boolean found=false;for(int i=0;i<c.getItemCount();i++)if(name.equals(String.valueOf(c.getItemAt(i)))){c.setSelectedIndex(i);found=true;break;}check(found,"Algorithm unavailable: "+name);}});}
    public static String wizardApply(){return schedule("wizardApply",new Job(){public void run()throws Exception{button(field(active(NewLayerEditor.class),"editor"),"apply");}});}
    public static String wizardStep(final String step){return schedule("wizardStep "+step,new Job(){public void run()throws Exception{NewLayerEditor n=active(NewLayerEditor.class);button(n,step.equals("previous")?"prev":step.equals("cancel")?"cancel":"next");}});}
    public static String wizardScenario(){return edt(new Callable<String>(){public String call()throws Exception{
        NewLayerEditor n=active(NewLayerEditor.class);check(((Integer)field(n,"current"))==1,"Wizard must be on edit step");DesignEditor e=(DesignEditor)field(n,"editor");FeatureLauncher f=(FeatureLauncher)field(e,"launcher");MasterFigureEditor me=(MasterFigureEditor)field(e,"edit");JComboBox<?> c=(JComboBox<?>)field(me,"choice");StringBuilder out=new StringBuilder("{\"pass\":true,\"features\":[");
        for(int i=0;i<f.numFeatureButtons();i++){f.setCurrent(i);if(i>0)out.append(',');out.append("{\"index\":").append(i).append(",\"sides\":").append(e.getActiveFeature().numPoints()).append(",\"algorithms\":[");int count=c.getItemCount();for(int j=0;j<count;j++){c.setSelectedIndex(j);String name=String.valueOf(c.getSelectedItem());FigureEditor panel=(FigureEditor)field(me,"current_panel");if(name.equals("Infer"))button(panel,"infer");Figure fig=me.getFigure();check(fig!=null,"Null figure for "+name);csk.taprats.geometry.Map map=fig.getMap();check(map!=null,"Null map for "+name);button(e,"apply");if(j>0)out.append(',');out.append("{\"name\":").append(q(name)).append(",\"vertices\":").append(map.numVertices()).append(",\"edges\":").append(map.numEdges()).append('}');}out.append("]}");}
        button(n,"next");check(((Integer)field(n,"current"))==2,"Preview step failed");button(n,"prev");check(((Integer)field(n,"current"))==1,"Previous failed");return out.append("],\"previewAndPrevious\":true}").toString();
    }});}
    public static String designerScenario(){return edt(new Callable<String>(){public String call()throws Exception{
        DesignerWindow w=active(DesignerWindow.class);DesignerPanel d=(DesignerPanel)field(w,"designer");check(d.countFeatures()==0,"Use a NEW empty designer (scenario will populate it)");
        perform(d.four_action,d);perform(d.add_poly_action,d);check(d.countFeatures()==1,"Add square failed");check(d.getFeature(0).getFeature().numPoints()==4,"Square sides wrong");perform(d.three_action,d);perform(d.add_poly_action,d);check(d.countFeatures()==2,"Add triangle failed");perform(d.exclude_all_action,d);perform(d.remove_excluded_action,d);check(d.countFeatures()==0,"Remove excluded failed");
        w.setTiling(KnownTilings.find("4^4"),null);int included=((Set<?>)field(d,"in_tiling")).size();check(included>0,"Fixture tiling absent");perform(d.remove_excluded_action,d);check(d.countFeatures()==included,"Remove copies failed");perform(d.fill_trans_action,d);check(d.countFeatures()==included*9,"Fill copies failed");perform(d.exclude_all_action,d);check(((Set<?>)field(d,"in_tiling")).size()==0,"Exclude all failed");perform(d.remove_excluded_action,d);check(d.countFeatures()==0,"Remove all excluded failed");
        w.setTiling(KnownTilings.find("4^4"),null);perform(d.clear_trans_action,d);check(!d.verifyTiling(null),"Clear translations failed");w.setTiling(KnownTilings.find("4^4"),null);check(d.verifyTiling(null),"Restore valid tiling failed");return "{\"pass\":true,\"checks\":[\"digit+Add square\",\"digit+Add triangle\",\"exclude\",\"remove excluded\",\"fill translations\",\"clear translations\",\"validate\"],\"designer\":"+id(w)+",\"note\":\"Seeded final 4^4 tiling ready for manual drag/preview/save checks\"}";
    }});}
    public static String mouse(final int componentId,final String kind,final int x,final int y,final int button,final int modifiers){return schedule("mouse "+kind,new Job(){public void run(){Component c=(Component)object(componentId);int type=kind.equals("press")?MouseEvent.MOUSE_PRESSED:kind.equals("release")?MouseEvent.MOUSE_RELEASED:kind.equals("drag")?MouseEvent.MOUSE_DRAGGED:kind.equals("move")?MouseEvent.MOUSE_MOVED:MouseEvent.MOUSE_CLICKED;c.dispatchEvent(new MouseEvent(c,type,System.currentTimeMillis(),modifiers,x,y,1,false,button));}});}
    public static String bindings(){return "{\"inputModifiers\":{\"SHIFT_DOWN_MASK\":64,\"BUTTON1_DOWN_MASK\":1024,\"BUTTON2_DOWN_MASK\":2048,\"BUTTON3_DOWN_MASK\":4096},\"note\":\"Coordinates for mouse are local component coordinates; snapshot.screen supplies physical window coordinates. state/snapshot provide EDT barriers; completed ticket confirms scheduled nonmodal work. A modal action completes after dialog dismissal.\"}";}
}
