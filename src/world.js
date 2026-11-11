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
    p.z+=sin(uv.y*4.5+uTime*.8)*uBend*.26;
    p.z-=pow(abs(uv.x-.5)*2.,2.)*(.12-uBend*.35);
    float distanceToPointer=distance(uv,uPointer);
    p.z+=sin(distanceToPointer*14.-uTime*2.2)*exp(-distanceToPointer*3.5)*uHover*.09*wave;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
  }
`;
const imageFragment=`
  varying vec2 vUv;uniform sampler2D uMap,uFlow;uniform vec2 uScreen,uPointer;
  uniform float uTime,uOpacity,uReveal,uHover,uFocus;uniform vec3 uAccent;
  float sdRoundBox(vec2 p,vec2 b,float r){
    vec2 q=abs(p)-b+r;
    return length(max(q,0.))+min(max(q.x,q.y),0.)-r;
  }
  void main(){
    vec2 centered=(vUv-.5)*vec2(1.54,1.0);
    float dist=sdRoundBox(centered,vec2(.755,.485),.022);
    float clipAlpha=1.-smoothstep(-.003,.004,dist);
    if(clipAlpha<.005)discard;

    vec4 flow=texture2D(uFlow,gl_FragCoord.xy/uScreen);
    vec2 direction=(flow.rg-.5)*2.;float dye=flow.b;
    vec2 delta=vUv-uPointer;float distanceToPointer=length(delta);
    float ripple=sin(distanceToPointer*22.-uTime*2.4)*exp(-distanceToPointer*5.5)*uHover*.004;
    vec2 parallax=(uPointer-.5)*uHover*.014;
    vec2 uv=clamp((vUv-.5)*(1.-uHover*.018)+.5+parallax+direction*dye*.012+normalize(delta+vec2(.00001))*ripple,vec2(.002),vec2(.998));
    float chromatic=dye*min(length(direction),1.)*.0025+uHover*.0008;
    vec3 colour=vec3(texture2D(uMap,uv+vec2(chromatic,0.)).r,texture2D(uMap,uv).g,texture2D(uMap,uv-vec2(chromatic,0.)).b);

    // Subtle spatial glass sheen & edge vignette
    float shineArg=(vUv.x-vUv.y*.32-uPointer.x*.85-.1)/.14;
    float shine=exp(-shineArg*shineArg)*(.025+uHover*.045);
    float vignette=smoothstep(1.15,.25,length((vUv-.5)*vec2(1.2,1.1)));
    colour=colour*(.86+.14*vignette)+vec3(shine);

    // Precision 1px optical glass frame & corner brackets
    float border=smoothstep(.009,.001,abs(dist+.004));
    vec2 cornerUv=abs(vUv-.5)*2.;
    float cornerBracket=step(.92,max(cornerUv.x,cornerUv.y))*step(.82,min(cornerUv.x,cornerUv.y))*border;
    vec3 borderCol=mix(vec3(.28,.32,.30),uAccent,clamp(uFocus*.45+uHover*.55+cornerBracket*.7,0.,1.));
    colour=mix(colour,borderCol,border*(.45+uFocus*.35+uHover*.2));

    float reveal=smoothstep(0.,.12,uReveal*1.14-(1.-vUv.y));
    gl_FragColor=vec4(colour,uOpacity*reveal*clipAlpha);
    #include <colorspace_fragment>
  }
`;

const wordVertex=`
  varying vec2 vUv;
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uOrbit;
  void main(){
    vUv=uv;
    vec3 p=position;
    float curve=pow(abs(uv.x-0.5)*2.0,2.0);
    p.z-=curve*0.52;
    float ptrDist=length((uv-0.5)*vec2(2.2,1.0)-uPointer*vec2(0.85,0.5));
    p.z+=exp(-ptrDist*2.6)*0.18*sin(uTime*1.4-ptrDist*4.0);
    p.y+=sin(uv.x*6.283+uTime*0.55)*0.022*(1.0-uOrbit*0.5);
    vec4 wp=modelMatrix*vec4(p,1.0);
    vWorldPos=wp.xyz;
    gl_Position=projectionMatrix*viewMatrix*wp;
  }
`;

const wordFragment=`
  varying vec2 vUv;
  varying vec3 vWorldPos;
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uOrbit;
  uniform float uReveal;
  uniform vec2 uPointer;
  uniform vec3 uAccent;
  uniform vec3 uSecondary;

  void main(){
    if(uOpacity<.004)discard;
    vec4 sampleMain=texture2D(uMap,vUv);
    vec2 parallaxDir=(vUv-0.5)*vec2(0.014,0.022) + uPointer*vec2(0.008,0.010);
    float echo1=texture2D(uMap,clamp(vUv+parallaxDir*0.65,vec2(0.001),vec2(0.999))).g;
    float echo2=texture2D(uMap,clamp(vUv+parallaxDir*1.35,vec2(0.001),vec2(0.999))).g;
    if(sampleMain.r+sampleMain.g+sampleMain.b+echo1+echo2<.004)discard;

    vec2 ptrUv=vec2(0.5+uPointer.x*0.38,0.5+uPointer.y*0.35);
    float ptrDist=length((vUv-ptrUv)*vec2(3.6,1.0));
    float ptrGlow=exp(-ptrDist*2.4);

    float fillMask=sampleMain.r;
    float strokeMask=sampleMain.g;
    float hudMask=sampleMain.b;

    // Kinetic reveal sweep from center outward
    float sweep=smoothstep(0.0,0.28,uReveal*1.28-abs(vUv.x-0.5)*0.85);

    // Internal micro-grid & scanning laser inside the giant DUVANSI letters
    vec2 gridCell= abs(fract(vUv*vec2(140.0,32.0))-0.5);
    float microGrid=1.0-smoothstep(0.0,0.08,min(gridCell.x,gridCell.y));
    float scanPhase=fract(vUv.x*0.85 - vUv.y*0.22 - uTime*0.18)-0.5;
    float scanWave=exp(-scanPhase*scanPhase*95.0);
    float verticalGrad=mix(0.68,1.04,smoothstep(0.15,0.85,vUv.y));

    // Morph between stark sculptural titanium-white & holographic wireframe as user scrolls
    float wireMode=smoothstep(0.12,0.58,uOrbit);
    float activeFill=fillMask*(1.0-wireMode*0.68);

    vec3 bodyCol=vec3(0.95,0.97,0.93)*verticalGrad;
    bodyCol+=uAccent*(microGrid*(0.08+ptrGlow*0.28+wireMode*0.22) + scanWave*0.38);
    bodyCol=mix(bodyCol,uSecondary*0.85+vec3(0.25),ptrGlow*0.18);

    vec3 strokeCol=mix(vec3(0.88,0.92,0.86),uAccent,0.55+0.45*sin(vUv.x*12.0-uTime*1.8));
    vec3 echoCol1=uAccent*(0.38+ptrGlow*0.35+wireMode*0.35);
    vec3 echoCol2=uSecondary*(0.28+ptrGlow*0.25+wireMode*0.25);
    vec3 hudCol=mix(vec3(0.62,0.68,0.60),uAccent,scanWave*0.75+ptrGlow*0.4);

    vec3 col=vec3(0.0);
    col+=echoCol2*echo2*0.48;
    col+=echoCol1*echo1*0.68;
    col=mix(col,bodyCol,activeFill);
    col+=strokeCol*strokeMask*(0.42+wireMode*0.65+ptrGlow*0.35+scanWave*0.35);
    col+=hudCol*hudMask*0.85;

    float alpha=clamp(activeFill*0.95 + strokeMask*(0.55+wireMode*0.45) + echo1*0.35 + echo2*0.22 + hudMask*0.75, 0.0, 1.0);
    gl_FragColor=vec4(col,alpha*uOpacity*sweep);
    #include <colorspace_fragment>
  }
`;

const glassVertex=`
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewPos;
  varying vec3 vViewNormal;
  varying vec3 vLocalPos;
  varying vec3 vLocalNormal;
  void main(){
    vLocalPos=position;
    vLocalNormal=normal;
    vec4 worldPosition=modelMatrix*vec4(position,1.0);
    vWorldPos=worldPosition.xyz;
    vWorldNormal=normalize(mat3(modelMatrix)*normal);
    vec4 mvPosition=viewMatrix*worldPosition;
    vViewPos=-mvPosition.xyz;
    vViewNormal=normalize(normalMatrix*normal);
    gl_Position=projectionMatrix*mvPosition;
  }
`;

const glassFragment=`
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewPos;
  varying vec3 vViewNormal;
  varying vec3 vLocalPos;
  varying vec3 vLocalNormal;

  uniform sampler2D uBackdrop;
  uniform vec2 uResolution;
  uniform vec2 uPointer;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uLight;
  uniform float uDispersion;
  uniform float uBackface;
  uniform vec3 uAccent;
  uniform vec3 uSecondary;

  // Pre-normalized spectral weights for the 6-tap dispersion loop (zero per-pixel weight math)
  const vec3 W0=vec3(0.42275,0.0,0.0);
  const vec3 W1=vec3(0.45351,0.06803,0.0);
  const vec3 W2=vec3(0.12374,0.43197,0.0);
  const vec3 W3=vec3(0.0,0.43197,0.12374);
  const vec3 W4=vec3(0.0,0.06803,0.45351);
  const vec3 W5=vec3(0.0,0.0,0.42275);
  const vec3 ENV_DIR1=vec3(-0.45268,0.68405,0.57204);
  const vec3 ENV_DIR2=vec3(0.62140,-0.25056,0.74167);
  const vec3 ENV_DIR3=vec3(0.0,0.92414,-0.38206);
  const vec3 LIGHT2_DIR=vec3(0.68302,-0.38169,0.62276);
  const vec3 LIGHT3_DIR=vec3(-0.35741,0.25529,-0.89863);

  vec3 studioEnv(vec3 R, float lightMode){
    float strip1=smoothstep(0.72,0.96,dot(R,ENV_DIR1));
    float strip2=smoothstep(0.68,0.95,dot(R,ENV_DIR2));
    float strip3=smoothstep(0.76,0.98,dot(R,ENV_DIR3));
    float ry=(R.y+0.08)*4.5;
    float horizon=exp(-ry*ry);
    float rz=max(0.0,-R.z);
    vec3 darkEnv=vec3(0.03,0.04,0.045)+vec3(0.95,0.98,0.94)*(strip1*0.85+strip3*1.1)+uAccent*(strip2*0.65+horizon*0.22)+uSecondary*(rz*rz*0.35);
    vec3 lightEnv=vec3(0.82,0.85,0.80)+vec3(1.0)*(strip1*0.6+strip3*0.75)+uAccent*(strip2*0.25);
    return mix(darkEnv,lightEnv,lightMode);
  }

  void main(){
    if(uOpacity<.004)discard;
    vec2 screenUv=gl_FragCoord.xy/max(uResolution,vec2(1.0));
    vec3 V=normalize(vViewPos);
    vec3 N=normalize(vViewNormal)*(gl_FrontFacing?1.0:-1.0);
    vec3 W=normalize(vWorldNormal)*(gl_FrontFacing?1.0:-1.0);
    vec3 worldV=normalize(cameraPosition-vWorldPos);

    vec2 chamberGrad=vec2(
      sin(vLocalPos.x*2.4+vWorldPos.y*0.5)*0.42 + vLocalPos.x*0.28,
      cos(vLocalPos.y*2.1-vWorldPos.x*0.4)*0.38 + vLocalPos.y*0.24
    );
    float bevelMask=smoothstep(0.96,0.32,abs(vLocalNormal.z));
    float microWave=sin(vLocalPos.y*9.0+vLocalPos.x*6.0+uTime*1.1)*0.022;
    vec2 opticalNormal=mix(chamberGrad*0.55+N.xy*0.65, N.xy*1.35, bevelMask) + vec2(microWave,-microWave);

    float ndotv=clamp(dot(V,N),0.0,1.0);
    float oneMinusNdotV=1.0-ndotv;
    float oneMinusSq=oneMinusNdotV*oneMinusNdotV;
    float fresnel=oneMinusSq*sqrt(oneMinusNdotV);
    float edgeGlow=oneMinusNdotV*sqrt(oneMinusNdotV);

    float thickness=mix(0.42,1.15,bevelMask)*(uBackface>0.5?0.65:1.0);
    vec2 refractDir=opticalNormal*thickness*(0.068+fresnel*0.045);
    refractDir.x*=uResolution.y/max(uResolution.x,1.0);

    float dispStrength=(0.28+bevelMask*0.62+fresnel*0.45)*uDispersion;
    vec2 perpDir=vec2(-refractDir.y,refractDir.x)*0.24*dispStrength;
    vec3 refracted;
    if(uBackface>0.5){
      vec2 uvR=clamp(screenUv - refractDir*(1.0-0.28*dispStrength) - perpDir*0.8, vec2(0.002), vec2(0.998));
      vec2 uvG=clamp(screenUv - refractDir, vec2(0.002), vec2(0.998));
      vec2 uvB=clamp(screenUv - refractDir*(1.0+0.28*dispStrength) + perpDir*0.8, vec2(0.002), vec2(0.998));
      refracted=vec3(texture2D(uBackdrop,uvR).r, texture2D(uBackdrop,uvG).g, texture2D(uBackdrop,uvB).b);
    }else{
      float d=0.34*dispStrength;
      refracted =texture2D(uBackdrop,clamp(screenUv-refractDir*(1.0-1.0*d)-perpDir*1.0,vec2(0.002),vec2(0.998))).rgb*W0;
      refracted+=texture2D(uBackdrop,clamp(screenUv-refractDir*(1.0-0.6*d)-perpDir*0.6,vec2(0.002),vec2(0.998))).rgb*W1;
      refracted+=texture2D(uBackdrop,clamp(screenUv-refractDir*(1.0-0.2*d)-perpDir*0.2,vec2(0.002),vec2(0.998))).rgb*W2;
      refracted+=texture2D(uBackdrop,clamp(screenUv-refractDir*(1.0+0.2*d)+perpDir*0.2,vec2(0.002),vec2(0.998))).rgb*W3;
      refracted+=texture2D(uBackdrop,clamp(screenUv-refractDir*(1.0+0.6*d)+perpDir*0.6,vec2(0.002),vec2(0.998))).rgb*W4;
      refracted+=texture2D(uBackdrop,clamp(screenUv-refractDir*(1.0+1.0*d)+perpDir*1.0,vec2(0.002),vec2(0.998))).rgb*W5;
      vec2 internalUv=clamp(screenUv + refractDir*0.55, vec2(0.002), vec2(0.998));
      vec3 internalSample=texture2D(uBackdrop,internalUv).rgb;
      refracted=mix(refracted,max(refracted,internalSample*0.92),bevelMask*0.32);
    }

    vec3 glassTint=mix(vec3(0.97,0.99,0.98), mix(vec3(0.92,0.97,0.90),uAccent*0.35+vec3(0.72,0.78,0.82),0.32), bevelMask*0.45);
    vec3 lightGlassTint=mix(vec3(0.94,0.96,0.93), vec3(0.75,0.82,0.72), bevelMask*0.55);
    refracted*=mix(glassTint,lightGlassTint,uLight);

    vec3 R=reflect(-worldV,W);
    vec3 envColor=studioEnv(R,uLight);
    float iridPhase=ndotv*5.2 + vLocalPos.y*1.4 - uTime*0.35;
    vec3 iridescence=0.5+0.5*cos(iridPhase+vec3(0.0,2.094,4.188));
    iridescence=mix(iridescence,uAccent,0.38);

    vec3 L1=normalize(vec3(-0.55,0.72,0.85)+vec3(uPointer*0.25,0.0));
    vec3 H1=normalize(V+L1);
    vec3 H2=normalize(V+LIGHT2_DIR);
    vec3 H3=normalize(V+LIGHT3_DIR);

    float nh1=max(dot(N,H1),0.0);
    float nh1_2=nh1*nh1, nh1_4=nh1_2*nh1_2, nh1_8=nh1_4*nh1_4, nh1_16=nh1_8*nh1_8;
    float specSoft1=nh1_16*nh1_4*0.22;
    float nh1_32=nh1_16*nh1_16, nh1_64=nh1_32*nh1_32;
    float specSharp1=nh1_64*nh1_64*nh1_8*nh1_4*1.55;

    float nh2=max(dot(N,H2),0.0);
    float nh2_2=nh2*nh2, nh2_4=nh2_2*nh2_2, nh2_8=nh2_4*nh2_4, nh2_16=nh2_8*nh2_8, nh2_32=nh2_16*nh2_16;
    float specSharp2=nh2_32*nh2_32*nh2_32*0.95;

    float nh3=max(dot(N,H3),0.0);
    float nh3_2=nh3*nh3, nh3_4=nh3_2*nh3_2, nh3_8=nh3_4*nh3_4, nh3_16=nh3_8*nh3_8, nh3_32=nh3_16*nh3_16;
    float specRim=nh3_32*nh3_8*nh3_2*0.65;

    float causticArg=(vLocalPos.x*0.75 - vLocalPos.y*0.42 - uPointer.x*0.65 - sin(uTime*0.7)*0.22)/0.24;
    float causticBand=exp(-causticArg*causticArg);
    vec3 caustic=mix(vec3(1.0),uAccent,0.45)*causticBand*(0.08+bevelMask*0.14);

    vec3 specular=vec3(1.0,1.0,0.98)*(specSharp1+specSoft1) + uAccent*specSharp2 + uSecondary*specRim + caustic;
    specular=specular/(1.0+specular*0.45);

    float reflectAmount=clamp(fresnel*0.68 + bevelMask*0.26, 0.04, 0.82);
    vec3 surfaceReflect=mix(envColor, iridescence*0.85+envColor*0.55, (fresnel*0.55+bevelMask*0.35)*(1.0-uLight*0.45));
    vec3 finalColor=mix(refracted, surfaceReflect, reflectAmount) + specular;

    vec3 rimTint=mix(mix(uAccent,vec3(0.95,0.98,1.0),0.55), vec3(0.18,0.24,0.16), uLight*0.75);
    finalColor+=rimTint*edgeGlow*(0.18+bevelMask*0.22)*(1.0-uLight*0.5);

    if(uBackface>0.5){
      float backAlpha=clamp((0.18+bevelMask*0.28+fresnel*0.25)*pow(uOpacity,1.25),0.0,0.55);
      gl_FragColor=vec4(finalColor*0.88,backAlpha);
    }else{
      float frontAlpha=clamp((0.88+bevelMask*0.10+fresnel*0.12)*pow(uOpacity,1.35),0.0,1.0);
      gl_FragColor=vec4(finalColor,frontAlpha);
    }
    #include <colorspace_fragment>
  }
`;

const edgeVertex=`
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  void main(){
    vLocalPos=position;
    vec4 wp=modelMatrix*vec4(position,1.0);
    vWorldPos=wp.xyz;
    gl_Position=projectionMatrix*viewMatrix*wp;
  }
`;

const edgeFragment=`
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uLight;
  uniform vec3 uAccent;
  void main(){
    if(uOpacity<.004)discard;
    float wave=0.5+0.5*sin(vLocalPos.y*3.2 - vLocalPos.x*2.4 + uTime*1.6);
    vec3 darkEdge=mix(vec3(0.88,0.94,0.90),uAccent,wave*0.65);
    vec3 lightEdge=mix(vec3(0.16,0.22,0.14),vec3(0.32,0.44,0.10),wave);
    vec3 col=mix(darkEdge,lightEdge,uLight);
    float alpha=mix(0.26+wave*0.24, 0.34, uLight)*uOpacity;
    gl_FragColor=vec4(col,alpha);
    #include <colorspace_fragment>
  }
`;

const originShots=[
  {at:0,   x:0,    y:.14, z:.18,  rx:-.07, ry:-.28, rz:-.05, scale:1.56, explode:0,    opacity:1,   word:1,   orbit:0,   dispersion:1.05},
  {at:.24, x:-.32, y:.12, z:.58,  rx:.18,  ry:1.15, rz:.12,  scale:1.62, explode:.14,  opacity:1,   word:.78, orbit:.24, dispersion:1.35},
  {at:.50, x:.08,  y:.10, z:-.18, rx:-.22, ry:2.85, rz:-.16, scale:1.24, explode:.96,  opacity:1,   word:.55, orbit:.52, dispersion:1.65},
  {at:.74, x:.10,  y:.11, z:.12,  rx:.14,  ry:4.65, rz:.10,  scale:1.42, explode:.38,  opacity:1,   word:.68, orbit:.74, dispersion:1.30},
  {at:.90, x:0,    y:.14, z:.05,  rx:-.06, ry:5.95, rz:-.06, scale:1.54, explode:0,    opacity:.96, word:.88, orbit:.90, dispersion:1.05},
  {at:1,   x:0,    y:.16, z:-3.8, rx:.12,  ry:6.58, rz:-.10, scale:.74,  explode:.38,  opacity:0,   word:0,   orbit:1,   dispersion:1.35},
];
const shotKeys=Object.keys(originShots[0]).filter(key=>key!=='at');

function catmullRom(p0,p1,p2,p3,t){
  const t2=t*t,t3=t2*t;
  return 0.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3);
}

function originFrame(progress,frame){
  const n=originShots.length;
  let idx=originShots.findIndex((shot,i)=>i>0&&progress<=shot.at);
  if(idx<0)idx=n-1;
  const i1=Math.max(0,idx-1),i2=idx,i0=Math.max(0,i1-1),i3=Math.min(n-1,i2+1);
  const a=originShots[i1],b=originShots[i2];
  const span=Math.max(.0001,b.at-a.at);
  const t=THREE.MathUtils.clamp((progress-a.at)/span,0,1);
  for(const key of shotKeys){
    const val=catmullRom(originShots[i0][key],a[key],b[key],originShots[i3][key],t);
    if(key==='explode'||key==='opacity'||key==='word'||key==='orbit'){
      frame[key]=Math.max(0,val);
    }else{
      frame[key]=val;
    }
  }
  return frame;
}

const vertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const roomFragment = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uLight;
  uniform vec3 uAccent;
  uniform vec2 uPointer;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float grid(vec2 uv){vec2 g=abs(fract(uv-.5)-.5)/max(fwidth(uv),vec2(.0001));return 1.-min(min(g.x,g.y),1.);}
  float crossMark(vec2 uv, vec2 scale){
    vec2 p=fract(uv*scale)-0.5;
    vec2 d=abs(p);
    float arm=step(max(d.x,d.y),0.09)*step(min(d.x,d.y),0.014);
    return arm;
  }
  void main(){
    vec2 uv=vUv; float rows=36.; float cols=96.;
    float fine=grid(uv*vec2(cols*3.,rows*3.));
    float major=grid(uv*vec2(cols,rows));
    float crosses=crossMark(uv,vec2(cols*.5,rows*.5));
    vec2 tile=floor(uv*vec2(48.,24.)); float n=hash(tile);
    float pulse=sin(uv.x*34.+uv.y*19.+uTime*.22)*.5+.5;
    float sh=fract(uv.y*4.0 - uTime*0.045)-0.5;
    float sv=fract(uv.x*6.0 + uTime*0.03)-0.5;
    float scanH=exp(-sh*sh*180.0)*major;
    float scanV=exp(-sv*sv*220.0)*major;

    vec2 ptrCenter=vec2(0.5+uPointer.x*0.12,0.52+uPointer.y*0.08);
    float chBase=max(0.,1.-length((uv-ptrCenter)*vec2(2.6,1.85)));
    float centerHalo=chBase*chBase*sqrt(chBase);
    float blBase=max(0.,1.-length((uv-vec2(.32+.025*sin(uTime*.08),.52))*vec2(2.8,1.9)));
    float bloom=blBase*blBase*blBase;
    vec3 dark=vec3(.006,.009,.010)+uAccent*(bloom*.042+centerHalo*.048);
    float vBase=max(0.,1.-length((uv-vec2(.68,.58))*vec2(3.6,2.6)));
    dark+=vec3(.11,.05,.18)*(vBase*vBase*vBase)*.22;
    dark+=uAccent*step(.89,n)*pulse*.022;

    vec3 light=vec3(.82,.85,.79);
    vec3 base=mix(dark,light,uLight);
    vec3 line=mix(vec3(.055,.082,.072),vec3(.48,.53,.45),uLight);
    base=mix(base,line,major*.32+fine*.065);
    base+=mix(uAccent*0.42,vec3(0.15,0.2,0.12),uLight)*(crosses*0.28 + (scanH+scanV)*0.22);

    float vertical=smoothstep(0.,.18,uv.y)*(1.-smoothstep(.88,1.,uv.y));
    base=mix(mix(vec3(.007,.010,.012),vec3(.84,.87,.81),uLight),base,vertical);
    gl_FragColor=vec4(base,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const clamp=THREE.MathUtils.clamp;
const smooth=(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b);

function makeLetterParts(){
  const stem=new THREE.Shape();
  stem.moveTo(-1.08,-1.32);stem.lineTo(-1.08,1.32);stem.lineTo(-.50,1.32);stem.lineTo(-.50,-1.32);stem.closePath();

  const top=new THREE.Shape();
  top.moveTo(-.35,1.32);top.lineTo(-.01,1.32);
  top.bezierCurveTo(1.05,1.32,1.37,.72,1.37,.07);
  top.lineTo(.78,.07);
  top.bezierCurveTo(.78,.45,.56,.75,-.01,.75);
  top.lineTo(-.35,.75);top.closePath();

  const bottom=new THREE.Shape();
  bottom.moveTo(-.35,-1.32);bottom.lineTo(-.01,-1.32);
  bottom.bezierCurveTo(1.05,-1.32,1.37,-.72,1.37,-.07);
  bottom.lineTo(.78,-.07);
  bottom.bezierCurveTo(.78,-.45,.56,-.75,-.01,-.75);
  bottom.lineTo(-.35,-.75);bottom.closePath();

  return [stem,top,bottom].map(shape=>{
    const geo=new THREE.ExtrudeGeometry(shape,{
      depth:.44,
      bevelEnabled:true,
      bevelThickness:.085,
      bevelSize:.072,
      bevelSegments:5,
      curveSegments:40,
      steps:1
    });
    geo.translate(-.14,0,-.22);
    geo.computeVertexNormals();
    return geo;
  });
}

function makeEnvironment(renderer){
  const env=new THREE.Scene();env.background=new THREE.Color(.02,.025,.03);
  const resources=[];
  const add=(w,h,pos,color)=>{const geo=new THREE.PlaneGeometry(w,h);const mat=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(...color),side:THREE.DoubleSide});const mesh=new THREE.Mesh(geo,mat);mesh.position.set(...pos);mesh.lookAt(0,0,0);env.add(mesh);resources.push(geo,mat);};
  add(3.5,13,[-5,3,4],[3.2,3.5,3.3]);add(2.5,10,[6,0,3],[3.0,3.5,4.2]);add(13,1.8,[0,6,-1],[3.8,4.1,3.5]);
  add(5,4,[4,-3,-3],[2.0,3.8,.35]);add(3,8,[-4,-1,-4],[2.4,.5,4.1]);add(4,1.2,[0,-5,5],[1.8,2.0,2.6]);
  const pmrem=new THREE.PMREMGenerator(renderer);const target=pmrem.fromScene(env,.025,.1,100);pmrem.dispose();resources.forEach(r=>r.dispose());return target;
}

/**
 * Multi-channel texture for the kinetic 3D DUVANSI stage wall:
 * R = solid monumental glyph mask
 * G = architectural wireframe outline + internal structural slices
 * B = HUD telemetry rails, crosshairs & degree ticks
 */
function wordTexture(){
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=512;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#000000';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  ctx.globalCompositeOperation='lighter';

  // Blue channel: HUD framing rails, ticks & metadata
  ctx.strokeStyle='#0000ff';
  ctx.fillStyle='#0000ff';
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(32,56);ctx.lineTo(2016,56);
  ctx.moveTo(32,456);ctx.lineTo(2016,456);
  for(let x=32;x<=2016;x+=124){
    ctx.moveTo(x,48);ctx.lineTo(x,64);
    ctx.moveTo(x,448);ctx.lineTo(x,464);
  }
  ctx.stroke();

  ctx.font='500 19px "JetBrains Mono", monospace';
  ctx.fillText('[ DUVANSI® // ANOTHER DIMENSION OF DESIGN ]',36,38);
  ctx.fillText('SYS.01 — SPATIAL OPTICAL STAGE // 16.0544° N, 108.2022° E',1330,38);
  ctx.fillText('IDENTITY / INTERACTION / REALTIME MOTION',36,490);
  ctx.fillText('[ REFRACTION FIELD ACTIVE ]',1685,490);

  // Red & Green channels: Monumental DUVANSI typography + architectural stroke
  ctx.save();
  ctx.font='700 348px "Space Grotesk", Arial, sans-serif';
  ctx.textBaseline='alphabetic';
  const width=ctx.measureText('DUVANSI').width;
  ctx.translate(32,0);
  ctx.scale(1984/width,1);

  // Red channel: Solid fill
  ctx.fillStyle='#ff0000';
  ctx.fillText('DUVANSI',0,378);

  // Green channel: Precision outer/inner wireframe stroke
  ctx.strokeStyle='#00ff00';
  ctx.lineWidth=5.5;
  ctx.strokeText('DUVANSI',0,378);
  ctx.restore();

  // Green channel: Subtle geometric slicing lines across the glyph zone
  ctx.strokeStyle='#00ff00';
  ctx.lineWidth=1.5;
  ctx.beginPath();
  ctx.moveTo(32,256);ctx.lineTo(2016,256);
  ctx.stroke();

  ctx.globalCompositeOperation='source-over';
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.NoColorSpace;texture.anisotropy=4;return texture;
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
  let renderer,scene,camera,environment,flow,budget,backdrop;let destroyed=false,contextLost=false,ready=false,revealed=false,occluded=false,compilation=0,frame=0,last=0,time=0,resolutionDirty=false;let enabled=!preference.matches;
  let width=innerWidth,height=innerHeight,compact=width<=600,fit=1,cardFit=1,wordFit=1,drawingWidth=0,drawingHeight=0,drawingRatio=0,resizeFrame=0;
  const pointer=new THREE.Vector2(),currentPointer=new THREE.Vector2(),imagePointer=new THREE.Vector2(.5,.5),currentImagePointer=new THREE.Vector2(.5,.5);
  const zeroPointer=new THREE.Vector2();let imageScreenScale=1;
  let hover=0,currentHover=0,lastHoverTarget=null,previousWork=0,workSpeed=0,previousOrigin=0,scrollImpulse=0;
  let phase='origin',progress=0,workProgress=0,theme=0,palette=0;
  const current={x:0,y:.14,z:.18,rx:-.07,ry:-.28,rz:-.05,scale:1.56,explode:0,opacity:1,word:1,cards:0,light:0,work:0,orbit:0,dispersion:1.05};
  const target={...current},stateKeys=Object.keys(current);
  const pieceReveals=[1,1,1];
  const pieceSprings=[
    {px:0,py:0,pz:0,rx:0,ry:0,rz:0,rate:8.8},
    {px:0,py:0,pz:0,rx:0,ry:0,rz:0,rate:6.5},
    {px:0,py:0,pz:0,rx:0,ry:0,rz:0,rate:5.2},
  ];
  const pieceTargets=[
    {px:0,py:0,pz:0,rx:0,ry:0,rz:0},
    {px:0,py:0,pz:0,rx:0,ry:0,rz:0},
    {px:0,py:0,pz:0,rx:0,ry:0,rz:0},
  ];
  const disposable=new Set(),textures=new Set();const parts=[],edges=[],cards=[];
  const palettes=[new THREE.Color('#d5ff4f'),new THREE.Color('#a894ff'),new THREE.Color('#ff8654')];
  const backPalettes=[new THREE.Color('#70d6fa'),new THREE.Color('#9181ff'),new THREE.Color('#7c8dff')];
  const on=(target,event,fn,opts)=>{target.addEventListener(event,fn,opts);cleanupListeners.push(()=>target.removeEventListener(event,fn,opts));};const cleanupListeners=[];
  let model,glassUniforms,room,wordmark,wordUniforms,key,fill,back,roomUniforms,orbits,dust;
  try{
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
    renderer.setClearColor('#090b0c');
    renderer.info.autoReset=false;
    report(.12);
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(40,width/height,.1,80);camera.position.set(0,0,9.2);
    flow=createFlowField(renderer);flow.setEnabled(enabled);
    backdrop=new THREE.WebGLRenderTarget(1,1,{type:THREE.UnsignedByteType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,stencilBuffer:false});
    disposable.add(backdrop);
    environment=makeEnvironment(renderer);scene.environment=environment.texture;
    report(.3);
    roomUniforms={uTime:{value:0},uLight:{value:0},uAccent:{value:palettes[0].clone()},uPointer:{value:new THREE.Vector2()}};
    const roomGeo=new THREE.CylinderGeometry(11,11,15,56,1,true);const roomMat=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:roomFragment,uniforms:roomUniforms,side:THREE.BackSide,depthWrite:false});
    room=new THREE.Mesh(roomGeo,roomMat);room.position.z=0;room.rotation.y=.3;scene.add(room);disposable.add(roomGeo);disposable.add(roomMat);
    const floor=new THREE.GridHelper(32,56,'#748862','#3d493a');floor.position.y=-3.6;floor.material.transparent=true;floor.material.opacity=.15;scene.add(floor);disposable.add(floor.geometry);disposable.add(floor.material);
    key=new THREE.DirectionalLight('#f4fff0',1.6);key.position.set(-3,4,6);scene.add(key);
    fill=new THREE.DirectionalLight('#d5ff4f',1.8);fill.position.set(4,-2,3);scene.add(fill);
    back=new THREE.DirectionalLight('#70d6fa',1.9);back.position.set(-3,1,-4);scene.add(back);

    glassUniforms={
      uBackdrop:{value:backdrop.texture},
      uResolution:{value:new THREE.Vector2(width,height)},
      uPointer:{value:new THREE.Vector2()},
      uTime:{value:0},
      uOpacity:{value:1},
      uLight:{value:0},
      uDispersion:{value:1.1},
      uBackface:{value:0},
      uAccent:{value:palettes[0].clone()},
      uSecondary:{value:backPalettes[0].clone()},
    };

    model=new THREE.Group();scene.add(model);
    orbits=new THREE.Group();scene.add(orbits);
    for(let i=0;i<2;i++){
      const points=Array.from({length:180},(_,j)=>{const angle=j/180*Math.PI*2;return new THREE.Vector3(Math.cos(angle)*(2.58+i*.28),Math.sin(angle)*(2.58+i*.28),0);});
      const geometry=new THREE.BufferGeometry().setFromPoints(points),lineMaterial=new THREE.LineBasicMaterial({color:i?'#70d6fa':'#d5ff4f',transparent:true,opacity:0,depthWrite:false});
      const ring=new THREE.LineLoop(geometry,lineMaterial);ring.rotation.set(i?1.1:.25,i?-.45:1.1,i?.4:-.3);orbits.add(ring);disposable.add(geometry);disposable.add(lineMaterial);
    }
    const dustGeometry=new THREE.BufferGeometry(),positions=new Float32Array(460*3);
    for(let i=0;i<460;i++){const angle=i*2.39996,radius=2.4+(i%29)/29*3.5;positions[i*3]=Math.cos(angle)*radius;positions[i*3+1]=Math.sin(angle)*radius*.68;positions[i*3+2]=-1.2-(i%17)*.2;}
    dustGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));const dustMaterial=new THREE.PointsMaterial({color:'#d5ff4f',size:.02,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});dust=new THREE.Points(dustGeometry,dustMaterial);scene.add(dust);disposable.add(dustGeometry);disposable.add(dustMaterial);

    const glassMaterials=[];
    makeLetterParts().forEach((geo)=>{
      const group=new THREE.Group();
      const pieceOpacity={value:1};
      const frontUni={...glassUniforms,uOpacity:pieceOpacity,uBackface:{value:0}};
      const backUni={...glassUniforms,uOpacity:pieceOpacity,uBackface:{value:1}};
      const edgeUni={uTime:glassUniforms.uTime,uOpacity:pieceOpacity,uLight:glassUniforms.uLight,uAccent:glassUniforms.uAccent};

      const backMat=new THREE.ShaderMaterial({vertexShader:glassVertex,fragmentShader:glassFragment,uniforms:backUni,transparent:true,depthWrite:false,side:THREE.BackSide,toneMapped:false});
      const frontMat=new THREE.ShaderMaterial({vertexShader:glassVertex,fragmentShader:glassFragment,uniforms:frontUni,transparent:true,depthWrite:true,side:THREE.FrontSide,toneMapped:false});
      const edgeMat=new THREE.ShaderMaterial({vertexShader:edgeVertex,fragmentShader:edgeFragment,uniforms:edgeUni,transparent:true,depthTest:true,depthWrite:false,toneMapped:false});

      const backMesh=new THREE.Mesh(geo,backMat);backMesh.renderOrder=1;
      const frontMesh=new THREE.Mesh(geo,frontMat);frontMesh.renderOrder=2;
      const edgeGeo=new THREE.EdgesGeometry(geo,24);
      const edge=new THREE.LineSegments(edgeGeo,edgeMat);edge.renderOrder=3;

      group.userData.pieceOpacity=pieceOpacity;
      group.add(backMesh,frontMesh,edge);
      model.add(group);
      parts.push(group);
      edges.push(edge);
      glassMaterials.push(backMat,frontMat,edgeMat);
      disposable.add(geo);disposable.add(edgeGeo);disposable.add(backMat);disposable.add(frontMat);disposable.add(edgeMat);
    });

    const logoTex=wordTexture();textures.add(logoTex);
    const logoGeo=new THREE.PlaneGeometry(15.2,3.6,48,14);
    wordUniforms={
      uMap:{value:logoTex},
      uTime:{value:0},
      uOpacity:{value:.96},
      uOrbit:{value:0},
      uReveal:{value:1},
      uPointer:{value:new THREE.Vector2()},
      uAccent:{value:palettes[0].clone()},
      uSecondary:{value:backPalettes[0].clone()},
    };
    const logoMat=new THREE.ShaderMaterial({vertexShader:wordVertex,fragmentShader:wordFragment,uniforms:wordUniforms,transparent:true,depthWrite:false,toneMapped:false});
    wordmark=new THREE.Mesh(logoGeo,logoMat);wordmark.position.set(0,.06,-2.25);scene.add(wordmark);disposable.add(logoGeo);disposable.add(logoMat);

    const loader=new THREE.TextureLoader(),cardGeometry=new THREE.PlaneGeometry(3.92,2.48,40,24),artLoads=[];let loadedArt=0;disposable.add(cardGeometry);
    featured.forEach((project)=>{let resolveArt;artLoads.push(new Promise(resolve=>{resolveArt=resolve;}));const finishArt=()=>{loadedArt++;if(!destroyed)report(.3+loadedArt*.12);resolveArt();requestDraw();};const tex=loader.load(project.art,finishArt,undefined,finishArt);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());textures.add(tex);const mat=new THREE.ShaderMaterial({vertexShader:imageVertex,fragmentShader:imageFragment,uniforms:{uMap:{value:tex},uFlow:{value:flow.texture},uScreen:{value:new THREE.Vector2()},uPointer:{value:new THREE.Vector2(.5,.5)},uTime:{value:0},uBend:{value:0},uHover:{value:0},uFocus:{value:1},uOpacity:{value:0},uReveal:{value:0},uAccent:{value:palettes[0].clone()}},transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});const mesh=new THREE.Mesh(cardGeometry,mat);scene.add(mesh);cards.push(mesh);disposable.add(mat);
    });
    const exposure={value:renderer.toneMappingExposure},prepared=new Set(glassMaterials);
    scene.traverse(object=>{if(!object.material)return;const materials=Array.isArray(object.material)?object.material:[object.material];for(const item of materials)if(!prepared.has(item)){prepared.add(item);prepareDisplayMaterial(item,exposure);}});
    budget=createRenderBudget(renderer,{width,height,devicePixelRatio:devicePixelRatio||1,onScale(){resolutionDirty=true;requestDraw();}});
    resize();prepareScene();
    const fontLoad=Promise.resolve(document.fonts?.ready).then(()=>{if(destroyed)return;const tex=wordTexture();textures.add(tex);const old=wordUniforms.uMap.value;wordUniforms.uMap.value=tex;if(old){old.dispose();textures.delete(old);}report(.76);requestDraw();});
    Promise.allSettled([bounded(Promise.allSettled(artLoads),6000),bounded(fontLoad,4000)]).then(()=>{if(destroyed)return;assetsReady=true;firstRendered=false;report(.94);requestDraw();});
  }catch(error){console.warn('The spatial scene is unavailable; the portfolio remains accessible.',error);settle('fallback');cleanup();html.classList.add('scene-fallback');return{ready:readiness,setState(){},setMotion(){},setOccluded(){},setIntroProgress(){},cycleAtmosphere(){},dispose(){}};}

  function applyResolution(){
    const ratio=budget.ratio;if(width===drawingWidth&&height===drawingHeight&&ratio===drawingRatio){resolutionDirty=false;return;}
    renderer.setDrawingBufferSize(width,height,ratio);flow.resize(width,height,ratio,compact);drawingWidth=width;drawingHeight=height;drawingRatio=ratio;
    const dw=Math.max(64,Math.floor(width*ratio)),dh=Math.max(64,Math.floor(height*ratio));
    const bw=Math.max(64,Math.floor(dw*.55)),bh=Math.max(64,Math.floor(dh*.55));
    if(backdrop.width!==bw||backdrop.height!==bh)backdrop.setSize(bw,bh);
    glassUniforms.uResolution.value.set(dw,dh);
    for(const card of cards)card.material.uniforms.uScreen.value.set(dw,dh);resolutionDirty=false;
  }
  function resize(){if(!renderer||destroyed||contextLost)return;width=innerWidth;height=innerHeight;compact=width<=600;const aspect=width/height;fit=Math.min(1,aspect/.68)*(width>600&&width<=1000&&aspect<=1.2?.8:1);cardFit=Math.min(1,aspect/.82);wordFit=Math.min(1,aspect/1.65);camera.aspect=aspect;camera.updateProjectionMatrix();imageScreenScale=height/(2*Math.tan(THREE.MathUtils.degToRad(20))*8.05);budget.resize(width,height,devicePixelRatio||1);applyResolution();targets();requestDraw();}
  function queueResize(){if(!resizeFrame&&!destroyed)resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;resize();});}
  function prepareScene(){
    const generation=++compilation;ready=false;
    for(const card of cards)card.visible=true;
    model.visible=true;wordmark.visible=true;
    flow.warmup(scene,camera).catch(()=>{}).then(()=>{if(destroyed||contextLost||generation!==compilation)return;ready=true;report(.86);budget.reset();last=0;if(diagnostics){diagnostics.start=performance.now();diagnostics.frames=0;diagnostics.cpu=0;}requestDraw();});
  }
  function targets(){
    const p=progress,t=originFrame(p,target);t.cards=0;t.light=theme;t.work=workProgress*2;
    if(phase==='work')Object.assign(t,{x:0,y:.14,z:-4.2,rx:.14,ry:6.58+workProgress*1.2,rz:-.12,scale:.68,explode:.42,opacity:0,word:0,cards:1,orbit:1,dispersion:1.25});
    if(phase==='vision')Object.assign(t,{x:compact?.35:1.42,y:compact?-1.55:.06,z:-.08,rx:.16,ry:8.43+p*1.05,rz:-.08+p*.22,scale:compact?1.22:1.54,explode:.32+p*.72,opacity:.92,word:0,cards:0,orbit:1,dispersion:1.55});
    if(phase==='about')Object.assign(t,{x:2.35,y:.15,z:-2.25,rx:.18,ry:9.55+p*.55,rz:.18,scale:1.15,opacity:0,word:0,explode:.22,cards:0,orbit:1,dispersion:1.15});
    if(phase==='contact')Object.assign(t,{x:compact?.75:2.15,y:.22,z:-1.35,rx:.06,ry:10.15+p*.45,rz:-.22,scale:1.28,opacity:.58,word:0,explode:.04,cards:0,orbit:1,dispersion:1.3});
    return t;
  }
  function render(now=0){
    frame=0;if(destroyed||contextLost||occluded||!ready||document.hidden)return;if(resolutionDirty)applyResolution();const delta=last?Math.min((now-last)/1000,1/15):1/60;last=now;
    const frameStart=performance.now();budget.begin(frameStart);renderer.info.reset();
    if(enabled)time+=delta;
    const blend=enabled?1-Math.exp(-delta*6.8):1;
    for(const key of stateKeys)current[key]=THREE.MathUtils.lerp(current[key],target[key],blend);
    currentPointer.lerp(enabled?pointer:zeroPointer,blend*.68);
    currentHover=THREE.MathUtils.lerp(currentHover,enabled?hover:0,blend);currentImagePointer.lerp(imagePointer,blend);

    const originDelta=Math.abs(progress-previousOrigin);previousOrigin=progress;
    scrollImpulse=THREE.MathUtils.lerp(scrollImpulse,Math.min(1.2,originDelta/Math.max(.001,delta)*.35),blend);
    workSpeed=THREE.MathUtils.lerp(workSpeed,Math.min(1,Math.abs(current.work-previousWork)/Math.max(.001,delta)*.6),blend);previousWork=current.work;

    roomUniforms.uTime.value=time;roomUniforms.uLight.value=current.light;roomUniforms.uAccent.value.lerp(palettes[palette],blend);roomUniforms.uPointer.value.copy(currentPointer);
    fill.color.lerp(palettes[palette],blend);back.color.lerp(backPalettes[palette],blend);
    fill.intensity=1.8+(enabled?Math.sin(time*.35)*.24:0);key.position.x=-3+(enabled?Math.sin(time*.22)*.45:0);
    room.rotation.y=.3+current.orbit*.58+currentPointer.x*.038+(enabled?Math.sin(time*.05)*.018:0);

    // Stage 1: Room & DUVANSI wall emerge first (introProgress 0.0 -> 0.45)
    // Stage 2: The 3 crystal pieces of the D materialize one by one AFTER the curtain opens (introProgress 0.28 -> 1.0)
    const stageEase=smooth(0.02,0.52,introProgress);
    const dMasterReveal=smooth(0.26,0.98,introProgress);
    pieceReveals[0]=smooth(0.26,0.78,introProgress);
    pieceReveals[1]=smooth(0.38,0.90,introProgress);
    pieceReveals[2]=smooth(0.48,1.00,introProgress);

    const floatY=enabled?Math.sin(time*.65)*.042 + Math.cos(time*.38)*.018:0;
    const floatX=enabled?Math.cos(time*.48)*.024:0;
    const introNotDone=1-dMasterReveal;
    model.position.set(
      current.x + floatX + currentPointer.x*.08,
      current.y + floatY - currentPointer.y*.06 - introNotDone*.12,
      current.z + introNotDone*.95
    );
    model.rotation.set(
      current.rx + currentPointer.y*.14 + (enabled?Math.cos(time*.32)*.038:0) + introNotDone*.32,
      current.ry + currentPointer.x*.28 + (enabled?Math.sin(time*.27)*.14:0) - introNotDone*1.25 + scrollImpulse*.18,
      current.rz + currentPointer.x*.05 + (enabled?Math.sin(time*.36)*.032:0) - introNotDone*.22
    );
    model.scale.setScalar(current.scale*fit*(.72+dMasterReveal*.28));

    // Per-piece staggered materialization & spring physics (zero per-frame heap allocations)
    const ex=current.explode + scrollImpulse*.08;
    const breathe=enabled?1:0;
    const v0=1-pieceReveals[0],v1=1-pieceReveals[1],v2=1-pieceReveals[2];
    const orbitSin=Math.sin(current.orbit*Math.PI);
    const pt0=pieceTargets[0],pt1=pieceTargets[1],pt2=pieceTargets[2];
    pt0.px=-ex*.64 - v0*1.45 + Math.cos(time*.72)*0.016*breathe - currentPointer.x*.035;
    pt0.py=-ex*.08 + v0*0.25 + Math.sin(time*.85)*0.022*breathe - currentPointer.y*.025;
    pt0.pz= ex*.26 + v0*1.35 + Math.sin(time*.62)*0.025*breathe;
    pt0.rx= v0*0.55 + Math.sin(time*.55)*0.025*breathe + currentPointer.y*.04;
    pt0.ry=-ex*.28 - v0*1.15 + Math.cos(time*.48)*0.032*breathe + currentPointer.x*.05;
    pt0.rz=-ex*.22 - v0*0.42 + Math.sin(time*.68)*0.018*breathe;

    pt1.px= ex*.52 + v1*1.55 + Math.sin(time*.78+1.2)*0.018*breathe + currentPointer.x*.045;
    pt1.py= ex*.56 + v1*0.95 + Math.cos(time*.66+1.2)*0.024*breathe - currentPointer.y*.04;
    pt1.pz= ex*.18 + v1*1.55 + Math.cos(time*.74+1.0)*0.030*breathe + orbitSin*.08;
    pt1.rx= ex*.22 - v1*0.65 + Math.cos(time*.60+1.1)*0.028*breathe + currentPointer.y*.055;
    pt1.ry= ex*.48 + v1*1.25 + Math.sin(time*.52+1.4)*0.036*breathe + currentPointer.x*.065;
    pt1.rz= ex*.18 + v1*0.48 + Math.cos(time*.70+1.2)*0.022*breathe;

    pt2.px= ex*.28 + v2*1.25 + Math.cos(time*.64+2.5)*0.018*breathe + currentPointer.x*.03;
    pt2.py=-ex*.62 - v2*1.05 + Math.sin(time*.74+2.5)*0.024*breathe + currentPointer.y*.035;
    pt2.pz=-ex*.22 + v2*1.45 + Math.sin(time*.58+2.2)*0.028*breathe - orbitSin*.06;
    pt2.rx=-ex*.20 + v2*0.62 + Math.sin(time*.62+2.3)*0.028*breathe - currentPointer.y*.045;
    pt2.ry=-ex*.36 - v2*1.05 + Math.cos(time*.54+2.6)*0.036*breathe + currentPointer.x*.05;
    pt2.rz= ex*.26 - v2*0.52 + Math.sin(time*.66+2.4)*0.022*breathe;
    parts.forEach((group,i)=>{
      const s=pieceSprings[i],pt=pieceTargets[i];
      const step=enabled&&introProgress>=1?1-Math.exp(-delta*s.rate):1;
      s.px=THREE.MathUtils.lerp(s.px,pt.px,step);
      s.py=THREE.MathUtils.lerp(s.py,pt.py,step);
      s.pz=THREE.MathUtils.lerp(s.pz,pt.pz,step);
      s.rx=THREE.MathUtils.lerp(s.rx,pt.rx,step);
      s.ry=THREE.MathUtils.lerp(s.ry,pt.ry,step);
      s.rz=THREE.MathUtils.lerp(s.rz,pt.rz,step);
      group.position.set(s.px,s.py,s.pz);
      group.rotation.set(s.rx,s.ry,s.rz);
      const pr=pieceReveals[i];
      group.scale.setScalar(.55+pr*.45);
      group.userData.pieceOpacity.value=current.opacity*pr;
      group.visible=current.opacity*pr>.004;
    });

    glassUniforms.uTime.value=time;
    glassUniforms.uLight.value=current.light;
    glassUniforms.uDispersion.value=current.dispersion + scrollImpulse*.45 + currentPointer.length()*.18 + introNotDone*.55;
    glassUniforms.uPointer.value.copy(currentPointer);
    glassUniforms.uAccent.value.copy(roomUniforms.uAccent.value);
    glassUniforms.uSecondary.value.lerp(backPalettes[palette],blend);

    const orbitOpacity=phase==='origin'?.12+Math.sin(current.orbit*Math.PI)*.28:.08;
    orbits.visible=orbitOpacity*stageEase>.001;orbits.scale.setScalar(fit);orbits.rotation.set(currentPointer.y*.05,current.orbit*.85+time*.045,current.orbit*.38);orbits.children.forEach(ring=>{ring.material.opacity=orbitOpacity*stageEase;});
    dust.material.opacity=(phase==='origin'?.22+Math.sin(current.orbit*Math.PI)*.20:.09)*stageEase;dust.rotation.z=current.orbit*.48+time*.015;

    wordmark.visible=current.word*stageEase>.001;
    wordmark.scale.set(wordFit*(1+Math.sin(current.orbit*Math.PI)*.10),wordFit,1);
    wordmark.rotation.y=currentPointer.x*.022-current.orbit*.08;
    wordUniforms.uTime.value=time;
    wordUniforms.uOpacity.value=current.word*.96*stageEase;
    wordUniforms.uOrbit.value=current.orbit;
    wordUniforms.uReveal.value=stageEase;
    wordUniforms.uPointer.value.copy(currentPointer);
    wordUniforms.uAccent.value.copy(roomUniforms.uAccent.value);
    wordUniforms.uSecondary.value.copy(glassUniforms.uSecondary.value);

    flow.update(delta,time,roomUniforms.uAccent.value,current.light);
    cards.forEach((card,index)=>{
      const d=index-current.work,focus=1-smooth(.08,.82,Math.abs(d)),opacity=current.cards*clamp(1.45-Math.abs(d)*.34,0,1),u=card.material.uniforms;
      card.visible=opacity>.005;if(!card.visible)return;
      card.scale.setScalar(cardFit*(.93+focus*.07+currentHover*focus*.02));const spacing=4.52*cardFit;
      card.position.set(d*spacing,-.03+Math.sin(time*.45+index)*.022*Number(enabled),.42-Math.min(2,Math.abs(d))*.88+currentHover*focus*.08);
      card.rotation.set(-currentPointer.y*.04*focus,-d*.22+currentPointer.x*.05*focus,-d*.02);
      u.uTime.value=time;u.uFlow.value=flow.texture;u.uPointer.value.copy(currentImagePointer);
      u.uHover.value=currentHover*focus;u.uFocus.value=focus;u.uBend.value=enabled?workSpeed*.75+Math.min(1,Math.abs(d))*.24:0;u.uOpacity.value=opacity;u.uReveal.value=current.cards;u.uAccent.value.copy(roomUniforms.uAccent.value);
    });
    camera.position.x=currentPointer.x*.055;camera.position.y=currentPointer.y*.032;camera.position.z=9.2+(1-stageEase)*.85;camera.lookAt(0,0,0);

    // Render backdrop scene behind the crystal D so the D refracts the room, kinetic DUVANSI wall, rings & cards
    if(current.opacity*dMasterReveal>.005){
      model.visible=false;
      const prevTarget=renderer.getRenderTarget();
      renderer.setRenderTarget(backdrop);
      renderer.render(scene,camera);
      renderer.setRenderTarget(prevTarget);
      model.visible=true;
    }else{
      model.visible=false;
    }

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
  function onPointer(event){
    if(!enabled||occluded||introProgress<1||event.pointerType==='touch')return;
    pointer.set(clamp((event.clientX/width-.5)*2,-1,1),clamp((event.clientY/height-.5)*2,-1,1));
    if(event.target!==lastHoverTarget){lastHoverTarget=event.target;hover=event.target?.closest?.('.work-hit')?1:0;}
    if(current.cards>.005)imagePointer.set(clamp(.5+(event.clientX-width*.5)/(3.92*cardFit*imageScreenScale),0,1),clamp(.5-(event.clientY-height*.5)/(2.48*cardFit*imageScreenScale),0,1));
    requestDraw();
  }
  function visibility(){budget.reset();if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;last=0;}else{if(diagnostics){diagnostics.start=performance.now();diagnostics.frames=0;diagnostics.cpu=0;}requestDraw();}}
  function cleanup(){if(destroyed)return;settle('disposed');destroyed=true;for(const timer of loadTimers)clearTimeout(timer);loadTimers.clear();if(frame)cancelAnimationFrame(frame);cancelAnimationFrame(resizeFrame);cleanupListeners.forEach(fn=>fn());budget?.dispose();flow?.dispose();disposable.forEach(item=>item.dispose?.());textures.forEach(tex=>tex.dispose());environment?.dispose();renderer?.dispose();html.classList.remove('scene-ready');}
  on(window,'resize',queueResize,{passive:true});on(window,'pointermove',onPointer,{passive:true});on(document,'visibilitychange',visibility);on(preference,'change',()=>setMotion(!preference.matches));
  on(document,'pointerleave',()=>{hover=0;pointer.set(0,0);});on(window,'blur',()=>{hover=0;pointer.set(0,0);});
  on(canvas,'webglcontextlost',event=>{event.preventDefault();contextLost=true;ready=false;revealed=false;compilation++;settle('fallback');budget.reset();if(frame)cancelAnimationFrame(frame);frame=0;html.classList.remove('scene-ready');html.classList.add('scene-fallback');});
  on(canvas,'webglcontextrestored',()=>{contextLost=false;last=0;drawingWidth=0;html.classList.remove('scene-fallback');resize();prepareScene();});
  return{ready:readiness,setState,setMotion,setOccluded,setIntroProgress,cycleAtmosphere(){palette=(palette+1)%palettes.length;requestDraw();return palette;},dispose:cleanup};
}
