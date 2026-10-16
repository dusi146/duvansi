import * as THREE from 'three';

const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const simulation=`
  varying vec2 vUv;
  uniform sampler2D uField;
  uniform vec2 uPointer,uPrevious,uVelocity;
  uniform float uAspect,uDt,uStrength,uBurst,uTime;
  float segment(vec2 p,vec2 a,vec2 b){vec2 v=b-a;float t=clamp(dot(p-a,v)/max(dot(v,v),.00001),0.,1.);return length(p-a-v*t);}
  void main(){
    vec4 field=texture2D(uField,vUv);
    vec2 velocity=(field.rg-.5)*2.;
    vec2 uv=clamp(vUv-velocity*.032*uDt,vec2(.002),vec2(.998));
    field=texture2D(uField,uv);
    velocity=(field.rg-.5)*2.*pow(.955,uDt);
    float ink=max(0.,field.b-.0035*uDt)*pow(.971,uDt);
    vec2 scale=vec2(uAspect,1.);
    float distanceToStroke=segment(vUv*scale,uPrevious*scale,uPointer*scale);
    float radius=.048+min(length(uVelocity),1.)*.032+uBurst*.018;
    float splat=exp(-pow(distanceToStroke/radius,2.)*2.1)*uStrength;
    vec2 relative=(vUv-uPointer)*scale;
    vec2 tangent=vec2(-relative.y,relative.x)/max(length(relative),.018);
    float turbulence=sin(vUv.x*31.+uTime*1.7)*cos(vUv.y*27.-uTime*1.2);
    velocity+=splat*(uVelocity*.37+tangent*(.11+turbulence*.06)+relative*uBurst*2.);
    velocity=clamp(velocity,vec2(-.95),vec2(.95));
    ink=clamp(ink+splat*.52,0.,1.);
    gl_FragColor=vec4(velocity*.5+.5,ink,1.);
  }
`;
const composite=`
  varying vec2 vUv;uniform sampler2D uScene,uField;
  uniform float uAspect,uLight;uniform vec3 uAccent;
  uniform vec4 uRipples[4];
  void main(){
    vec4 flow=texture2D(uField,vUv);vec2 velocity=(flow.rg-.5)*2.;float ink=flow.b;
    vec2 displacement=velocity*ink*.035;
    float rings=0.;
    for(int i=0;i<4;i++){
      vec4 ripple=uRipples[i];vec2 delta=(vUv-ripple.xy)*vec2(uAspect,1.);
      float distanceToTap=length(delta);float age=ripple.z;
      float radius=age*.28;
      float ring=exp(-pow((distanceToTap-radius)/.0055,2.))*pow(max(0.,1.-age),2.)*ripple.w;
      rings+=ring;displacement+=normalize(delta+vec2(.0001))*ring*.004;
    }
    vec2 uv=clamp(vUv+displacement,vec2(.001),vec2(.999));
    float aberration=ink*min(length(velocity),1.)*.006;
    vec3 colour=vec3(texture2D(uScene,uv+vec2(aberration,0.)).r,texture2D(uScene,uv).g,texture2D(uScene,uv-vec2(aberration,0.)).b);
    float folds=.5+.5*sin(ink*24.+velocity.x*8.-velocity.y*11.);
    vec3 violet=vec3(.32,.12,.75);
    vec3 iridescence=mix(uAccent,violet,clamp(.5+velocity.y*.7,0.,1.));
    float veil=ink*(.18+folds*.20);
    colour=mix(colour,colour*.73+iridescence*.52,veil*(1.-uLight*.55));
    colour+=iridescence*(pow(ink,1.8)*folds*.19+rings*.17)*(1.-uLight*.68);
    colour=mix(colour,colour-vec3(.035)*ink*uLight,clamp(uLight,0.,1.));
    gl_FragColor=vec4(max(colour,vec3(0.)),1.);
    #include <colorspace_fragment>
  }
`;

/** A low-resolution advected field refracts the scene; pointer events never block scrolling. */
export function createFlowField(renderer){
  const quadGeometry=new THREE.PlaneGeometry(2,2),camera=new THREE.Camera();
  const simulationScene=new THREE.Scene(),compositeScene=new THREE.Scene();
  const options={type:THREE.UnsignedByteType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false};
  let read=new THREE.WebGLRenderTarget(1,1,options),write=new THREE.WebGLRenderTarget(1,1,options);
  // Display-linear colors fit RGBA8; multisample edge smoothing remains enabled.
  const capture=new THREE.WebGLRenderTarget(1,1,{type:THREE.UnsignedByteType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,stencilBuffer:false});
  const simulationUniforms={uField:{value:read.texture},uPointer:{value:new THREE.Vector2(.5,.5)},uPrevious:{value:new THREE.Vector2(.5,.5)},uVelocity:{value:new THREE.Vector2()},uAspect:{value:1},uDt:{value:1},uStrength:{value:0},uBurst:{value:0},uTime:{value:0}};
  const ripples=Array.from({length:4},()=>new THREE.Vector4(-5,-5,2,0));
  const compositeUniforms={uScene:{value:capture.texture},uField:{value:read.texture},uAspect:{value:1},uLight:{value:0},uAccent:{value:new THREE.Color('#d5ff4f')},uRipples:{value:ripples}};
  const simulationMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:simulation,uniforms:simulationUniforms,depthTest:false,depthWrite:false,toneMapped:false});
  const compositeMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:composite,uniforms:compositeUniforms,depthTest:false,depthWrite:false,toneMapped:false});
  simulationScene.add(new THREE.Mesh(quadGeometry,simulationMaterial));compositeScene.add(new THREE.Mesh(quadGeometry,compositeMaterial));
  const pointer=new THREE.Vector2(.5,.5),previous=new THREE.Vector2(.5,.5),velocity=new THREE.Vector2();
  const neutral=new THREE.Color().setRGB(.5,.5,0),savedColour=new THREE.Color();
  let width=1,height=1,active=true,blocked=false,hasPointer=false,pending=false,burst=0,rippleIndex=0,disposed=false,remaining=0,painted=false;
  const removers=[];
  const listen=(target,event,handler)=>{target.addEventListener(event,handler,{passive:true});removers.push(()=>target.removeEventListener(event,handler));};
  function move(x,y){
    if(!active||blocked||disposed)return;
    if(x<0||y<0||x>width||y>height)return;
    const px=x/width,py=1-y/height;
    if(!hasPointer){pointer.set(px,py);previous.copy(pointer);hasPointer=true;}
    pointer.set(px,py);pending=true;
  }
  listen(window,'pointermove',event=>move(event.clientX,event.clientY));
  listen(window,'touchmove',event=>{const touch=event.touches[0];if(touch)move(touch.clientX,touch.clientY);});
  listen(window,'pointerdown',event=>{
    if(event.button>0||!active)return;move(event.clientX,event.clientY);if(!pending)return;
    burst=1;ripples[rippleIndex].set(pointer.x,pointer.y,0,event.pointerType==='touch'?.65:1);rippleIndex=(rippleIndex+1)%ripples.length;
  });
  listen(window,'blur',()=>{hasPointer=false;pending=false;});
  listen(document,'pointerleave',()=>{hasPointer=false;pending=false;});
  function clear(){
    const target=renderer.getRenderTarget(),alpha=renderer.getClearAlpha();renderer.getClearColor(savedColour);renderer.setClearColor(neutral,1);
    renderer.setRenderTarget(read);renderer.clear();renderer.setRenderTarget(write);renderer.clear();renderer.setRenderTarget(target);renderer.setClearColor(savedColour,alpha);
    for(const ripple of ripples)ripple.set(-5,-5,2,0);pending=false;hasPointer=false;burst=0;remaining=0;painted=false;compositeUniforms.uField.value=read.texture;
  }
  function resize(w,h,ratio,compact){
    width=w;height=h;const aspect=w/h,size=compact?192:320;
    const fw=aspect>1?size:Math.max(64,Math.round(size*aspect)),fh=aspect>1?Math.max(64,Math.round(size/aspect)):size;
    const fieldChanged=read.width!==fw||read.height!==fh;
    if(fieldChanged){read.setSize(fw,fh);write.setSize(fw,fh);}
    const samples=Math.min(2,renderer.capabilities.maxSamples||0);if(capture.samples!==samples){capture.dispose();capture.samples=samples;}capture.setSize(Math.floor(w*ratio),Math.floor(h*ratio));
    simulationUniforms.uAspect.value=aspect;compositeUniforms.uAspect.value=aspect;if(fieldChanged)clear();
  }
  function update(delta,time,accent,light){
    if(!active||disposed)return;
    if(pending)remaining=3;
    else remaining=Math.max(0,remaining-delta);
    if(!pending&&remaining===0){if(painted)clear();return;}
    painted=true;
    const step=Math.min(4,Math.max(.25,delta*60));
    velocity.copy(pointer).sub(previous);velocity.x*=width/height;
    const distance=velocity.length();velocity.multiplyScalar(19).clampLength(0,1.2);
    simulationUniforms.uField.value=read.texture;simulationUniforms.uPointer.value.copy(pointer);simulationUniforms.uPrevious.value.copy(previous);simulationUniforms.uVelocity.value.copy(velocity);
    simulationUniforms.uDt.value=step;simulationUniforms.uTime.value=time;simulationUniforms.uStrength.value=pending?Math.min(1.5,.12+distance*28+burst):0;simulationUniforms.uBurst.value=burst;
    renderer.setRenderTarget(write);renderer.render(simulationScene,camera);renderer.setRenderTarget(null);[read,write]=[write,read];
    previous.copy(pointer);pending=false;burst=0;for(const ripple of ripples)ripple.z=Math.min(2,ripple.z+delta*.75);
    compositeUniforms.uField.value=read.texture;compositeUniforms.uAccent.value.copy(accent);compositeUniforms.uLight.value=light;
  }
  function render(scene,sceneCamera){
    if(!painted){renderer.setRenderTarget(null);renderer.render(scene,sceneCamera);return;}
    renderer.setRenderTarget(capture);renderer.render(scene,sceneCamera);renderer.setRenderTarget(null);renderer.render(compositeScene,camera);
  }
  async function warmup(scene,sceneCamera){
    const previousTarget=renderer.getRenderTarget();
    renderer.setRenderTarget(capture);const captured=renderer.compileAsync(scene,sceneCamera);
    renderer.setRenderTarget(read);const simulated=renderer.compileAsync(simulationScene,camera);
    renderer.setRenderTarget(null);const composited=renderer.compileAsync(compositeScene,camera);
    renderer.setRenderTarget(previousTarget);await Promise.all([captured,simulated,composited]);
    if(disposed)return;await renderer.compileAsync(scene,sceneCamera);
  }
  return{
    resize,update,render,warmup,
    setEnabled(value){active=Boolean(value);if(!active)clear();},
    setBlocked(value){blocked=Boolean(value);if(blocked){pending=false;hasPointer=false;}},
    get processing(){return painted;},
    get texture(){return read.texture;},
    dispose(){if(disposed)return;disposed=true;removers.forEach(fn=>fn());read.dispose();write.dispose();capture.dispose();quadGeometry.dispose();simulationMaterial.dispose();compositeMaterial.dispose();},
  };
}
