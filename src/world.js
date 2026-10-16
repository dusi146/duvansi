import * as THREE from 'three';
import { featured } from './projects.js';
import { createFlowField } from './flow-field.js';
import { createRenderBudget } from './render-budget.js';
import { prepareDisplayMaterial } from './display-material.js';

const imageVertex=`
  varying vec2 vUv;uniform float uTime,uBend,uHover;uniform vec2 uPointer;
  void main(){
    vUv=uv;vec3 p=position;
    float wave=sin(uv.y*3.14159)*sin(uv.x*3.14159);
    p.z+=sin(uv.y*5.+uTime*.8)*uBend*.32;
    p.z+=pow(abs(uv.x-.5)*2.,2.)*uBend*.55;
    float distanceToPointer=distance(uv,uPointer);
    p.z+=sin(distanceToPointer*15.-uTime*2.)*exp(-distanceToPointer*3.5)*uHover*.10*wave;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
  }
`;
const imageFragment=`
  varying vec2 vUv;uniform sampler2D uMap,uFlow;uniform vec2 uScreen,uPointer;
  uniform float uTime,uOpacity,uReveal,uHover;
  void main(){
    vec4 flow=texture2D(uFlow,gl_FragCoord.xy/uScreen);
    vec2 direction=(flow.rg-.5)*2.;float dye=flow.b;
    vec2 delta=vUv-uPointer;float distanceToPointer=length(delta);
    float ripple=sin(distanceToPointer*25.-uTime*2.5)*exp(-distanceToPointer*5.)*uHover*.005;
    vec2 uv=clamp(vUv+direction*dye*.022+normalize(delta+vec2(.00001))*ripple,vec2(.001),vec2(.999));
    float chromatic=dye*min(length(direction),1.)*.004+uHover*.00065;
    vec3 colour=vec3(texture2D(uMap,uv+vec2(chromatic,0.)).r,texture2D(uMap,uv).g,texture2D(uMap,uv-vec2(chromatic,0.)).b);
    float shine=exp(-pow((vUv.x-vUv.y*.3-uPointer.x)/.13,2.))*uHover*.035;
    float reveal=smoothstep(0.,.12,uReveal*1.14-(1.-vUv.y));
    gl_FragColor=vec4(colour+vec3(shine),uOpacity*reveal);
    #include <colorspace_fragment>
  }
`;

const originShots=[
  {at:0,x:0,y:.16,z:0,rx:-.08,ry:-.38,rz:-.12,scale:1.5,explode:0,opacity:1,word:1,orbit:0},
  {at:.23,x:-.38,y:.12,z:.45,rx:.2,ry:1.3,rz:.16,scale:1.55,explode:.06,opacity:1,word:.35,orbit:.2},
  {at:.49,x:.12,y:.12,z:-.35,rx:.3,ry:3.55,rz:-.2,scale:1.12,explode:1.2,opacity:1,word:.08,orbit:.48},
  {at:.72,x:.12,y:.1,z:-.1,rx:-.16,ry:5.1,rz:.13,scale:1.32,explode:.58,opacity:1,word:.3,orbit:.7},
  {at:.88,x:0,y:.16,z:0,rx:-.08,ry:5.9,rz:-.12,scale:1.5,explode:0,opacity:1,word:.65,orbit:.86},
  {at:1,x:0,y:0,z:-2.8,rx:.1,ry:6.68,rz:-.15,scale:.95,explode:0,opacity:.2,word:0,orbit:1},
];
const shotKeys=Object.keys(originShots[0]).filter(key=>key!=='at');
function originFrame(progress,frame){
  const index=originShots.findIndex((shot,i)=>i>0&&progress<=shot.at);
  const b=originShots[index<0?originShots.length-1:index],a=originShots[Math.max(0,(index<0?originShots.length-1:index)-1)];
  const amount=THREE.MathUtils.smoothstep(progress,a.at,b.at);
  for(const key of shotKeys)frame[key]=THREE.MathUtils.lerp(a[key],b[key],amount);
  return frame;
}

const vertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const roomFragment = `
  varying vec2 vUv; uniform float uTime; uniform float uLight; uniform vec3 uAccent;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float grid(vec2 uv){vec2 g=abs(fract(uv-.5)-.5)/max(fwidth(uv),vec2(.0001));return 1.-min(min(g.x,g.y),1.);}
  void main(){
    vec2 uv=vUv; float rows=38.; float cols=100.;
    float fine=grid(uv*vec2(cols*3.,rows*3.)); float major=grid(uv*vec2(cols,rows));
    vec2 tile=floor(uv*vec2(40.,20.)); float n=hash(tile); float pulse=sin(uv.x*31.+uv.y*17.+uTime*.14)*.5+.5;
    float bloom=pow(max(0.,1.-length((uv-vec2(.3+.025*sin(uTime*.06),.52))*vec2(3.,2.))),3.);
    vec3 dark=vec3(.009,.013,.014)+uAccent*bloom*.035;
    dark+=vec3(.10,.045,.15)*pow(max(0.,1.-length((uv-vec2(.7,.6))*vec2(4.,3.))),3.)*.18;
    dark+=uAccent*step(.88,n)*pulse*.018;
    vec3 light=vec3(.76,.80,.73); vec3 base=mix(dark,light,uLight);
    vec3 line=mix(vec3(.045,.065,.055),vec3(.45,.50,.42),uLight);
    base=mix(base,line,major*.28+fine*.055);
    float vertical=smoothstep(0.,.18,uv.y)*(1.-smoothstep(.88,1.,uv.y));
    base=mix(mix(vec3(.01,.015,.018),vec3(.80,.83,.77),uLight),base,vertical);
    gl_FragColor=vec4(base,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const clamp=THREE.MathUtils.clamp;
const smooth=(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b);

function makeLetterParts(){
  const stem=new THREE.Shape();stem.moveTo(-1.06,-1.3);stem.lineTo(-1.06,1.3);stem.lineTo(-.51,1.3);stem.lineTo(-.51,-1.3);stem.closePath();
  const top=new THREE.Shape();top.moveTo(-.36,1.3);top.lineTo(-.02,1.3);top.bezierCurveTo(1.02,1.3,1.34,.70,1.34,.08);top.lineTo(.77,.08);top.bezierCurveTo(.77,.44,.56,.74,-.02,.74);top.lineTo(-.36,.74);top.closePath();
  const bottom=new THREE.Shape();bottom.moveTo(-.36,-1.3);bottom.lineTo(-.02,-1.3);bottom.bezierCurveTo(1.02,-1.3,1.34,-.70,1.34,-.08);bottom.lineTo(.77,-.08);bottom.bezierCurveTo(.77,-.44,.56,-.74,-.02,-.74);bottom.lineTo(-.36,-.74);bottom.closePath();
  return [stem,top,bottom].map(shape=>{const geo=new THREE.ExtrudeGeometry(shape,{depth:.37,bevelEnabled:true,bevelThickness:.065,bevelSize:.065,bevelSegments:5,curveSegments:48,steps:1});geo.translate(-.14,0,-.185);return geo;});
}

function makeEnvironment(renderer){
  const env=new THREE.Scene();env.background=new THREE.Color(.025,.03,.035);
  const resources=[];
  const add=(w,h,pos,color)=>{const geo=new THREE.PlaneGeometry(w,h);const mat=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(...color),side:THREE.DoubleSide});const mesh=new THREE.Mesh(geo,mat);mesh.position.set(...pos);mesh.lookAt(0,0,0);env.add(mesh);resources.push(geo,mat);};
  add(3,12,[-5,3,4],[2.8,3.1,2.9]);add(2,9,[6,0,3],[2.8,3.2,3.8]);add(12,1.5,[0,6,-1],[3.5,3.8,3.2]);
  add(5,4,[4,-3,-3],[1.8,3.5,.25]);add(3,8,[-4,-1,-4],[2.1,.4,3.8]);add(4,1,[0,-5,5],[1.5,1.7,2.2]);
  const pmrem=new THREE.PMREMGenerator(renderer);const target=pmrem.fromScene(env,.025,.1,100);pmrem.dispose();resources.forEach(r=>r.dispose());return target;
}

function wordTexture(){
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=384;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f2f3ed';ctx.font='600 350px "Space Grotesk", Arial, sans-serif';ctx.textBaseline='alphabetic';
  const width=ctx.measureText('DUVANSI').width;ctx.translate(30,0);ctx.scale(1988/width,1);ctx.fillText('DUVANSI',0,299);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

/** One renderer connects identity, projects, and the approach into a spatial narrative. */
export function createWorld({onLoadProgress=()=>{}}={}){
  const canvas=document.getElementById('world-canvas');const html=document.documentElement;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let resolveReady,settled=false,assetsReady=false,firstRendered=false,loadProgress=0,introProgress=1;
  const readiness=new Promise(resolve=>{resolveReady=resolve;}),loadTimers=new Set();
  function report(value){loadProgress=Math.max(loadProgress,value);onLoadProgress(loadProgress);}
  function settle(mode){if(settled)return;settled=true;report(1);resolveReady({mode});}
  function checkReadiness(){if(assetsReady&&firstRendered)settle('webgl');}
  function bounded(promise,delay){return new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);loadTimers.delete(timer);resolve();};const timer=setTimeout(finish,delay);loadTimers.add(timer);Promise.resolve(promise).then(finish,finish);});}
  const diagnostics=import.meta.env.DEV?{start:performance.now(),frames:0,total:0,cpu:0}:null;
  let renderer,scene,camera,environment,flow,budget;let destroyed=false,contextLost=false,ready=false,revealed=false,occluded=false,compilation=0,frame=0,last=0,time=0,resolutionDirty=false;let enabled=!preference.matches;
  let width=innerWidth,height=innerHeight,compact=width<=600,fit=1,cardFit=1,wordFit=1,drawingWidth=0,drawingHeight=0,drawingRatio=0,resizeFrame=0;
  const pointer=new THREE.Vector2(),currentPointer=new THREE.Vector2(),imagePointer=new THREE.Vector2(.5,.5),currentImagePointer=new THREE.Vector2(.5,.5);
  const zeroPointer=new THREE.Vector2();let imageScreenScale=1;
  let hover=0,currentHover=0,previousWork=0,workSpeed=0;
  let phase='origin',progress=0,workProgress=0,theme=0,palette=0;
  const current={x:0,y:.1,z:0,rx:-.08,ry:-.38,rz:-.12,scale:1.5,explode:0,opacity:1,word:1,cards:0,light:0,work:0,orbit:0};
  const target={...current},stateKeys=Object.keys(current);
  const disposable=new Set(),textures=new Set();const parts=[],edges=[],cards=[];
  const palettes=[new THREE.Color('#d5ff4f'),new THREE.Color('#a894ff'),new THREE.Color('#ff8654')];
  const backPalettes=[new THREE.Color('#9181ff'),new THREE.Color('#70d6fa'),new THREE.Color('#7c8dff')];
  const on=(target,event,fn,opts)=>{target.addEventListener(event,fn,opts);cleanupListeners.push(()=>target.removeEventListener(event,fn,opts));};const cleanupListeners=[];
  let model,material,room,wordmark,key,fill,back,roomUniforms,orbits,dust;
  try{
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
    renderer.setClearColor('#090b0c');
    renderer.info.autoReset=false;
    report(.12);
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(40,width/height,.1,80);camera.position.set(0,0,9.2);
    flow=createFlowField(renderer);flow.setEnabled(enabled);
    environment=makeEnvironment(renderer);scene.environment=environment.texture;
    report(.3);
    roomUniforms={uTime:{value:0},uLight:{value:0},uAccent:{value:palettes[0].clone()}};
    const roomGeo=new THREE.CylinderGeometry(11,11,15,100,1,true);const roomMat=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:roomFragment,uniforms:roomUniforms,side:THREE.BackSide,depthWrite:false});
    room=new THREE.Mesh(roomGeo,roomMat);room.position.z=0;room.rotation.y=.3;scene.add(room);disposable.add(roomGeo);disposable.add(roomMat);
    const floor=new THREE.GridHelper(30,50,'#657457','#3d493a');floor.position.y=-3.6;floor.material.transparent=true;floor.material.opacity=.12;scene.add(floor);disposable.add(floor.geometry);disposable.add(floor.material);
    key=new THREE.DirectionalLight('#f4fff0',1.5);key.position.set(-3,4,6);scene.add(key);
    fill=new THREE.DirectionalLight('#d5ff4f',1.7);fill.position.set(4,-2,3);scene.add(fill);
    back=new THREE.DirectionalLight('#9181ff',1.8);back.position.set(-3,1,-4);scene.add(back);
    material=new THREE.MeshPhysicalMaterial({color:'#e7eae0',metalness:1,roughness:.17,clearcoat:1,clearcoatRoughness:.12,iridescence:.55,iridescenceIOR:1.4,iridescenceThicknessRange:[100,420],envMapIntensity:1.4,transparent:true,opacity:1});
    material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nvec2 finishWave=vec2(sin(vViewPosition.y*1.1+vViewPosition.x*.8),cos(vViewPosition.x*1.4-vViewPosition.y*.4))*.22;normal=normalize(normal+vec3(finishWave,0.0));');};
    material.customProgramCacheKey=()=> 'duvansi-chrome-v1';disposable.add(material);
    model=new THREE.Group();scene.add(model);
    orbits=new THREE.Group();scene.add(orbits);
    for(let i=0;i<2;i++){
      const points=Array.from({length:180},(_,j)=>{const angle=j/180*Math.PI*2;return new THREE.Vector3(Math.cos(angle)*(2.55+i*.25),Math.sin(angle)*(2.55+i*.25),0);});
      const geometry=new THREE.BufferGeometry().setFromPoints(points),lineMaterial=new THREE.LineBasicMaterial({color:i?'#b29aff':'#d5ff4f',transparent:true,opacity:0,depthWrite:false});
      const ring=new THREE.LineLoop(geometry,lineMaterial);ring.rotation.set(i?1.1:.25,i?-.45:1.1,i?.4:-.3);orbits.add(ring);disposable.add(geometry);disposable.add(lineMaterial);
    }
    const dustGeometry=new THREE.BufferGeometry(),positions=new Float32Array(420*3);
    for(let i=0;i<420;i++){const angle=i*2.39996,radius=2.6+(i%29)/29*3.3;positions[i*3]=Math.cos(angle)*radius;positions[i*3+1]=Math.sin(angle)*radius*.65;positions[i*3+2]=-1-(i%17)*.2;}
    dustGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));const dustMaterial=new THREE.PointsMaterial({color:'#d5ff4f',size:.018,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});dust=new THREE.Points(dustGeometry,dustMaterial);scene.add(dust);disposable.add(dustGeometry);disposable.add(dustMaterial);
    makeLetterParts().forEach((geo,index)=>{const group=new THREE.Group();const mesh=new THREE.Mesh(geo,material);group.add(mesh);const edgeGeo=new THREE.EdgesGeometry(geo,30);const edgeMat=new THREE.LineBasicMaterial({color:'#4b6018',transparent:true,opacity:0,depthTest:true,depthWrite:false});const edge=new THREE.LineSegments(edgeGeo,edgeMat);group.add(edge);model.add(group);parts.push(group);edges.push(edge);disposable.add(geo);disposable.add(edgeGeo);disposable.add(edgeMat);});
    const logoTex=wordTexture();textures.add(logoTex);const logoGeo=new THREE.PlaneGeometry(14,2.625);const logoMat=new THREE.MeshBasicMaterial({map:logoTex,transparent:true,opacity:.94,depthWrite:false,toneMapped:false});
    wordmark=new THREE.Mesh(logoGeo,logoMat);wordmark.position.set(0,.05,-2.2);scene.add(wordmark);disposable.add(logoGeo);disposable.add(logoMat);
    const loader=new THREE.TextureLoader(),cardGeometry=new THREE.PlaneGeometry(4.4,2.86,64,36),artLoads=[];let loadedArt=0;disposable.add(cardGeometry);
    featured.forEach((project,index)=>{let resolveArt;artLoads.push(new Promise(resolve=>{resolveArt=resolve;}));const finishArt=()=>{loadedArt++;if(!destroyed)report(.3+loadedArt*.12);resolveArt();requestDraw();};const tex=loader.load(project.art,finishArt,undefined,finishArt);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());textures.add(tex);const mat=new THREE.ShaderMaterial({vertexShader:imageVertex,fragmentShader:imageFragment,uniforms:{uMap:{value:tex},uFlow:{value:flow.texture},uScreen:{value:new THREE.Vector2()},uPointer:{value:new THREE.Vector2(.5,.5)},uTime:{value:0},uBend:{value:0},uHover:{value:0},uOpacity:{value:0},uReveal:{value:0}},transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});const mesh=new THREE.Mesh(cardGeometry,mat);scene.add(mesh);cards.push(mesh);disposable.add(mat);
    });
    const exposure={value:renderer.toneMappingExposure},prepared=new Set();
    scene.traverse(object=>{if(!object.material)return;const materials=Array.isArray(object.material)?object.material:[object.material];for(const item of materials)if(!prepared.has(item)){prepared.add(item);prepareDisplayMaterial(item,exposure);}});
    budget=createRenderBudget(renderer,{width,height,devicePixelRatio:devicePixelRatio||1,onScale(){resolutionDirty=true;requestDraw();}});
    resize();prepareScene();
    const fontLoad=Promise.resolve(document.fonts?.ready).then(()=>{if(destroyed)return;const tex=wordTexture();textures.add(tex);const old=wordmark.material.map;wordmark.material.map=tex;wordmark.material.needsUpdate=true;if(old){old.dispose();textures.delete(old);}report(.76);requestDraw();});
    Promise.allSettled([bounded(Promise.allSettled(artLoads),6000),bounded(fontLoad,4000)]).then(()=>{if(destroyed)return;assetsReady=true;firstRendered=false;report(.94);requestDraw();});
  }catch(error){console.warn('The spatial scene is unavailable; the portfolio remains accessible.',error);settle('fallback');cleanup();html.classList.add('scene-fallback');return{ready:readiness,setState(){},setMotion(){},setOccluded(){},setIntroProgress(){},cycleAtmosphere(){},dispose(){}};}

  function applyResolution(){
    const ratio=budget.ratio;if(width===drawingWidth&&height===drawingHeight&&ratio===drawingRatio){resolutionDirty=false;return;}
    renderer.setDrawingBufferSize(width,height,ratio);flow.resize(width,height,ratio,compact);drawingWidth=width;drawingHeight=height;drawingRatio=ratio;
    for(const card of cards)card.material.uniforms.uScreen.value.set(Math.floor(width*ratio),Math.floor(height*ratio));resolutionDirty=false;
  }
  function resize(){if(!renderer||destroyed||contextLost)return;width=innerWidth;height=innerHeight;compact=width<=600;const aspect=width/height;fit=Math.min(1,aspect/.68)*(width>600&&width<=1000&&aspect<=1.2?.8:1);cardFit=Math.min(1,aspect/.82);wordFit=Math.min(1,aspect/1.65);camera.aspect=aspect;camera.updateProjectionMatrix();imageScreenScale=height/(2*Math.tan(THREE.MathUtils.degToRad(20))*8.05);budget.resize(width,height,devicePixelRatio||1);applyResolution();targets();requestDraw();}
  function queueResize(){if(!resizeFrame&&!destroyed)resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;resize();});}
  function prepareScene(){
    const generation=++compilation;ready=false;
    flow.warmup(scene,camera).catch(()=>{}).then(()=>{if(destroyed||contextLost||generation!==compilation)return;ready=true;report(.86);budget.reset();last=0;if(diagnostics){diagnostics.start=performance.now();diagnostics.frames=0;diagnostics.cpu=0;}requestDraw();});
  }
  function targets(){
    const p=progress,t=originFrame(p,target);t.cards=0;t.light=theme;t.work=workProgress*2;
    if(phase==='work')Object.assign(t,{x:0,y:0,z:-2.8,rx:.1,ry:6.68+workProgress*1.4,rz:-.15,scale:.95,explode:0,opacity:.2,word:0,cards:1,orbit:1});
    if(phase==='vision')Object.assign(t,{x:compact?.35:1.4,y:compact?-1.6:.05,z:-.15,rx:.18,ry:7.38+p*.8,rz:-.1+p*.2,scale:compact?1.2:1.5,explode:.35+p*.85,opacity:.78,word:0,cards:0,orbit:1});
    if(phase==='about')Object.assign(t,{x:2.5,y:.15,z:-2.4,rx:.2,ry:8.78+p*.4,rz:.2,scale:1.2,opacity:.22,word:0,explode:.1,cards:0,orbit:1});
    if(phase==='contact')Object.assign(t,{x:compact?.75:2.3,y:.25,z:-1.3,rx:.05,ry:9.13+p*.35,rz:-.25,scale:1.35,opacity:.35,word:0,explode:0,cards:0,orbit:1});
    return t;
  }
  function render(now=0){
    frame=0;if(destroyed||contextLost||occluded||!ready||document.hidden)return;if(resolutionDirty)applyResolution();const delta=last?Math.min((now-last)/1000,1/15):1/60;last=now;
    const frameStart=performance.now();budget.begin(frameStart);renderer.info.reset();
    if(enabled)time+=delta;const blend=enabled?1-Math.exp(-delta*7):1;for(const key of stateKeys)current[key]=THREE.MathUtils.lerp(current[key],target[key],blend);
    currentPointer.lerp(enabled?pointer:zeroPointer,blend*.7);
    currentHover=THREE.MathUtils.lerp(currentHover,enabled?hover:0,blend);currentImagePointer.lerp(imagePointer,blend);
    workSpeed=THREE.MathUtils.lerp(workSpeed,Math.min(1,Math.abs(current.work-previousWork)/Math.max(.001,delta)*.6),blend);previousWork=current.work;
    roomUniforms.uTime.value=time;roomUniforms.uLight.value=current.light;roomUniforms.uAccent.value.lerp(palettes[palette],blend);
    fill.color.lerp(palettes[palette],blend);back.color.lerp(backPalettes[palette],blend);
    fill.intensity=1.7+(enabled?Math.sin(time*.3)*.22:0);key.position.x=-3+(enabled?Math.sin(time*.18)*.4:0);
    room.rotation.y=.3+current.orbit*.55+currentPointer.x*.03+(enabled?Math.sin(time*.045)*.015:0);
    model.position.set(current.x,current.y+(enabled?Math.sin(time*.5)*.035:0),current.z);
    model.rotation.set(current.rx+currentPointer.y*.10+(enabled?Math.cos(time*.19)*.025:0),current.ry+currentPointer.x*.22+(enabled?Math.sin(time*.21)*.12:0)-(1-introProgress)*.85,current.rz+(enabled?Math.sin(time*.24)*.025:0));model.scale.setScalar(current.scale*fit*(.6+introProgress*.4));
    const ex=current.explode+(1-introProgress)*.18;parts[0].position.set(-ex*.62,-ex*.12,ex*.2);parts[0].rotation.set(0,-ex*.20,-ex*.25);
    parts[1].position.set(ex*.48,ex*.55,ex*.12);parts[1].rotation.set(ex*.15,ex*.45,ex*.15);
    parts[2].position.set(ex*.20,-ex*.62,-ex*.12);parts[2].rotation.set(-ex*.14,-ex*.30,ex*.25);
    material.opacity=current.opacity;material.depthWrite=current.opacity>.9;
    material.roughness=THREE.MathUtils.lerp(.17,.27,current.light);material.iridescence=THREE.MathUtils.lerp(.55,.8,current.light);material.envMapIntensity=THREE.MathUtils.lerp(1.4,.65,current.light);
    edges.forEach(edge=>{edge.material.opacity=current.light*.27;edge.visible=current.light>.01;});
    const orbitOpacity=phase==='origin'?Math.sin(current.orbit*Math.PI)*.3:0;
    orbits.visible=orbitOpacity>.001;orbits.scale.setScalar(fit);orbits.rotation.set(0,current.orbit*.8+time*.035,current.orbit*.35);orbits.children.forEach(ring=>{ring.material.opacity=orbitOpacity;});
    dust.material.opacity=phase==='origin'?.18+Math.sin(current.orbit*Math.PI)*.18:.06;dust.rotation.z=current.orbit*.45+time*.012;
    wordmark.visible=current.word*introProgress>.001;wordmark.scale.set(wordFit*(1+Math.sin(current.orbit*Math.PI)*.12),wordFit,1);wordmark.material.opacity=current.word*.94*introProgress;wordmark.rotation.y=currentPointer.x*.015-current.orbit*.09;
    flow.update(delta,time,roomUniforms.uAccent.value,current.light);
    cards.forEach((card,index)=>{
      const d=index-current.work,focus=1-smooth(.1,.85,Math.abs(d)),opacity=current.cards*clamp(1.4-Math.abs(d)*.32,0,1),u=card.material.uniforms;
      card.visible=opacity>.005;if(!card.visible)return;
      card.scale.setScalar(cardFit*(1+currentHover*focus*.015));const spacing=4.95*cardFit;
      card.position.set(d*spacing,.05+Math.sin(time*.45+index)*.025*Number(enabled),1.15-Math.min(2,Math.abs(d))*.9+currentHover*focus*.08);
      card.rotation.set(-currentPointer.y*.045*focus,-d*.21+currentPointer.x*.055*focus,-d*.025);
      u.uTime.value=time;u.uFlow.value=flow.texture;u.uPointer.value.copy(currentImagePointer);
      u.uHover.value=currentHover*focus;u.uBend.value=enabled?workSpeed*.85+Math.min(1,Math.abs(d))*.28:0;u.uOpacity.value=opacity;u.uReveal.value=current.cards;
    });
    camera.position.x=currentPointer.x*.045;camera.position.y=currentPointer.y*.025;camera.lookAt(0,0,0);
    flow.render(scene,camera);
    budget.end(performance.now());if(!revealed){revealed=true;html.classList.add('scene-ready');}if(!firstRendered){firstRendered=true;checkReadiness();}
    if(diagnostics){diagnostics.frames++;diagnostics.total++;diagnostics.cpu+=performance.now()-frameStart;const elapsed=performance.now()-diagnostics.start;if(elapsed>=1500){canvas.dataset.renderFps=(diagnostics.frames*1000/elapsed).toFixed(1);canvas.dataset.renderCpu=(diagnostics.cpu/diagnostics.frames).toFixed(2);canvas.dataset.renderCalls=String(renderer.info.render.calls);canvas.dataset.renderTriangles=String(renderer.info.render.triangles);canvas.dataset.renderFrames=String(diagnostics.total);canvas.dataset.renderRatio=budget.ratio.toFixed(2);canvas.dataset.renderGpu=budget.stats.gpuMs?.toFixed(2)||'unavailable';canvas.dataset.renderFlow=String(flow.processing);diagnostics.start=performance.now();diagnostics.frames=0;diagnostics.cpu=0;}}
    if(enabled&&!frame)frame=requestAnimationFrame(render);
  }
  function requestDraw(){if(!destroyed&&!contextLost&&!occluded&&ready&&!document.hidden&&!frame)frame=requestAnimationFrame(render);}
  function setState(state){phase=state.phase||phase;progress=clamp(state.progress||0,0,1);workProgress=clamp(state.workProgress||0,0,1);theme=clamp(state.theme||0,0,1);targets();requestDraw();}
  function setMotion(value){enabled=Boolean(value)&&!preference.matches;flow.setEnabled(enabled);budget.reset();last=0;if(frame)cancelAnimationFrame(frame);frame=0;requestDraw();}
  function setOccluded(value){const next=Boolean(value);if(next===occluded)return;occluded=next;flow.setBlocked(next||introProgress<1);budget.reset();last=0;if(frame)cancelAnimationFrame(frame);frame=0;if(diagnostics){canvas.dataset.renderOccluded=String(next);canvas.dataset.renderFrames=String(diagnostics.total);}if(!next){if(diagnostics){diagnostics.start=performance.now();diagnostics.frames=0;diagnostics.cpu=0;}requestDraw();}}
  function setIntroProgress(value){introProgress=clamp(value,0,1);flow.setBlocked(occluded||introProgress<1);requestDraw();}
  function onPointer(event){if(!enabled||occluded||introProgress<1||event.pointerType==='touch')return;pointer.set(clamp((event.clientX/width-.5)*2,-1,1),clamp((event.clientY/height-.5)*2,-1,1));hover=event.target.closest?.('.work-hit')?1:0;imagePointer.set(clamp(.5+(event.clientX-width*.5)/(4.4*cardFit*imageScreenScale),0,1),clamp(.5-(event.clientY-height*.5)/(2.86*cardFit*imageScreenScale),0,1));requestDraw();}
  function visibility(){budget.reset();if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;last=0;}else{if(diagnostics){diagnostics.start=performance.now();diagnostics.frames=0;diagnostics.cpu=0;}requestDraw();}}
  function cleanup(){if(destroyed)return;settle('disposed');destroyed=true;for(const timer of loadTimers)clearTimeout(timer);loadTimers.clear();if(frame)cancelAnimationFrame(frame);cancelAnimationFrame(resizeFrame);cleanupListeners.forEach(fn=>fn());budget?.dispose();flow?.dispose();disposable.forEach(item=>item.dispose?.());textures.forEach(tex=>tex.dispose());environment?.dispose();renderer?.dispose();html.classList.remove('scene-ready');}
  on(window,'resize',queueResize,{passive:true});on(window,'pointermove',onPointer,{passive:true});on(document,'visibilitychange',visibility);on(preference,'change',()=>setMotion(!preference.matches));
  on(document,'pointerleave',()=>{hover=0;pointer.set(0,0);});on(window,'blur',()=>{hover=0;pointer.set(0,0);});
  on(canvas,'webglcontextlost',event=>{event.preventDefault();contextLost=true;ready=false;revealed=false;compilation++;settle('fallback');budget.reset();if(frame)cancelAnimationFrame(frame);frame=0;html.classList.remove('scene-ready');html.classList.add('scene-fallback');});
  on(canvas,'webglcontextrestored',()=>{contextLost=false;last=0;drawingWidth=0;html.classList.remove('scene-fallback');resize();prepareScene();});
  return{ready:readiness,setState,setMotion,setOccluded,setIntroProgress,cycleAtmosphere(){palette=(palette+1)%palettes.length;requestDraw();return palette;},dispose:cleanup};
}
