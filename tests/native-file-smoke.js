/* eslint-disable no-var -- Native Java 8 Nashorn uses ES5. */
var FileInputStream=Java.type('java.io.FileInputStream');
var ObjectInputStream=Java.type('java.io.ObjectInputStream');
var input=new ObjectInputStream(new FileInputStream(arguments[0]));
var layers=input.readObject();input.close();
var result=[];
for(var i=0;i<layers.size();i++){var s=layers.get(i),m=s.getMap();result.push({style:String(s.getClass().getSimpleName()),tiling:String(s.getPrototype().getTiling().getName()),vertices:m.numVertices(),edges:m.numEdges()});}
if(layers.size()!==5)throw Error('Expected five saved layers');
print(JSON.stringify({nativeReopened:true,layers:result}));
