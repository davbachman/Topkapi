package taprats.web;
import csk.taprats.Program;
import csk.taprats.ui.MainWindow;
import csk.taprats.ui.tile.DesignerWindow;
import csk.taprats.toolkit.Util;
import csk.taprats.tile.KnownTilings;
import csk.taprats.tile.Tiling;
import java.awt.*;
import java.io.*;
import java.util.*;
import javax.swing.*;
/** Browser integration only. No original application classes are replaced. */
public final class BrowserBridge {
 private static MainWindow main; private static JFrame frame;
 private static final File workspace=new File("/files/workspace");
 private static final String orderName=".taprats-import-order";
 private static final Properties importOrder=new Properties();
 public static void start(final int width,final int height)throws Exception{
  workspace.mkdirs();
  KnownTilings.countTilings();
  File orderFile=new File(workspace,orderName);if(orderFile.exists())try(InputStream in=new FileInputStream(orderFile)){importOrder.load(in);}
  java.util.List<File> saved=new ArrayList<File>();collect(workspace,saved);
  // Restore newer definitions last when several files use one tiling name.
  Collections.sort(saved,new Comparator<File>(){public int compare(File a,File b){int order=Long.compare(restoreOrder(a),restoreOrder(b));return order!=0?order:relativePath(a).compareTo(relativePath(b));}});
  for(File file:saved)if(file.getName().toLowerCase(Locale.ROOT).endsWith(".tiling")){
   try{Tiling.readTiling(file);}catch(Exception e){System.err.println("Could not restore tiling "+file.getName()+": "+e.getMessage());}
  }
  for(String kind:new String[]{"examples","tilings","images","eps","svg"})Util.setRecentDirectory(kind,workspace);
  SwingUtilities.invokeAndWait(new Runnable(){public void run(){
   Program.main(new String[0]);for(Frame candidate:Frame.getFrames()){
    if(!(candidate instanceof JFrame))continue;
    for(Component component:((JFrame)candidate).getContentPane().getComponents())if(component instanceof MainWindow){frame=(JFrame)candidate;main=(MainWindow)component;}
   }
   // A desktop exit becomes a closed browser workspace, keeping saved files
   // and the browser runtime available for downloads and a clean restart.
   if(frame!=null){
    for(java.awt.event.WindowListener listener:frame.getWindowListeners())frame.removeWindowListener(listener);
    frame.addWindowListener(new java.awt.event.WindowAdapter(){public void windowClosing(java.awt.event.WindowEvent event){if(main.confirmClosingWindow()){for(Frame window:Frame.getFrames())window.dispose();}}});
   }
   fit(width,height);
  }});if(main==null)throw new IllegalStateException("Taprats did not create its main window.");
 }
 private static void fit(int width,int height){if(frame!=null){frame.setLocation(0,0);frame.setSize(Math.max(900,width),Math.max(660,height));frame.validate();}}
 public static void resize(final int width,final int height){SwingUtilities.invokeLater(new Runnable(){public void run(){fit(width,height);}});}
 public static boolean isRunning(){return frame!=null&&frame.isDisplayable();}
 public static boolean hasUnsavedChanges()throws Exception{
  final boolean[] result={false};SwingUtilities.invokeAndWait(new Runnable(){public void run(){result[0]=isRunning()&&main.hasOriginalDataChanged();for(Frame f:Frame.getFrames())if(f.isVisible()&&f instanceof DesignerWindow&&((DesignerWindow)f).hasOriginalDataChanged())result[0]=true;}});return result[0];
 }
 public static String importFile(String source,String name)throws IOException{
  name=new File(name.replace('\\','/')).getName();if(name.equals(".")||name.equals("..")||name.length()==0)throw new IOException("Invalid filename.");
  File target=new File(workspace,name);int suffix=1;
  while(target.exists()){int dot=name.lastIndexOf('.');String stem=dot>0?name.substring(0,dot):name;String ext=dot>0?name.substring(dot):"";target=new File(workspace,stem+" ("+suffix+++")"+ext);}
  try(InputStream in=new FileInputStream(source);OutputStream out=new FileOutputStream(target)){byte[] data=new byte[65536];int count;while((count=in.read(data))!=-1)out.write(data,0,count);}
  if(name.toLowerCase(Locale.ROOT).endsWith(".tiling")){
   try{Tiling.readTiling(target);}catch(Exception error){target.delete();throw new IOException("Invalid tiling: "+error.getMessage(),error);}
   // Browser file timestamps have one-second precision and cannot be set.
   // Persist import order separately so rapid revisions restore consistently.
   long newest=System.currentTimeMillis();for(Object value:importOrder.values())newest=Math.max(newest,Long.parseLong(value.toString())+1);
   importOrder.setProperty(relativePath(target),Long.toString(newest));try(OutputStream out=new FileOutputStream(new File(workspace,orderName))){importOrder.store(out,"Custom tiling import order");}
  }
  return target.getAbsolutePath();
 }
 private static String quote(String text){StringBuilder out=new StringBuilder("\"");for(int i=0;i<text.length();i++){char c=text.charAt(i);if(c=='\\'||c=='\"')out.append('\\').append(c);else if(c<32)out.append(String.format("\\u%04x",(int)c));else out.append(c);}return out.append('"').toString();}
 private static String relativePath(File file){return workspace.toURI().relativize(file.toURI()).getPath();}
 private static long restoreOrder(File file){try{return Math.max(file.lastModified(),Long.parseLong(importOrder.getProperty(relativePath(file),"0")));}catch(NumberFormatException error){return file.lastModified();}}
 private static void collect(File folder,java.util.List<File> files){File[] children=folder.listFiles();if(children==null)return;Arrays.sort(children);for(File child:children){if(child.getName().equals(".java")||child.getName().equals(orderName))continue;if(child.isDirectory())collect(child,files);else files.add(child);}}
 public static String listFiles(){java.util.List<File> files=new ArrayList<File>();collect(workspace,files);StringBuilder json=new StringBuilder("[");for(File file:files){if(json.length()>1)json.append(',');json.append("{\"name\":").append(quote(workspace.toURI().relativize(file.toURI()).getPath())).append(",\"path\":").append(quote(file.getAbsolutePath())).append(",\"size\":").append(file.length()).append('}');}return json.append(']').toString();}
}
