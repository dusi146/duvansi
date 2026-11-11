import gsap from 'gsap';
import './intro.css';

/**
 * DUVANSI opening, modelled on the alche.studio intro grammar:
 *  1. CAD drafting  — long hairline bundles, compass circles and spokes construct the letter D.
 *  2. Cipher motto  — a mono line decrypts left → right while the drawing completes.
 *  3. Lock          — the D outline solidifies, crosshairs pop, guides dim.
 *  4. Lens          — chromatic split, liquid warp and a soft expanding lens punch through
 *                     to the live WebGL stage, where the crystal D assembles.
 */
const NS='http://www.w3.org/2000/svg';
const CX=798.3,CY=470;
const MARK_PATHS=[
  'M616 245.6H715V694.4H616Z',
  'M740.5 245.6H798.3C978.5 245.6 1032.9 347.6 1032.9 458.1H932.6C932.6 393.5 895.2 342.5 798.3 342.5H740.5Z',
  'M740.5 694.4H798.3C978.5 694.4 1032.9 592.4 1032.9 481.9H932.6C932.6 546.5 895.2 597.5 798.3 597.5H740.5Z',
];
const MOTTO='Design beyond the expected. Another dimension.';
const MOTTO_CHARS=[...MOTTO];
const CIPHER='DUVANSI';

function el(name,attrs={},parent){
  const node=document.createElementNS(NS,name);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  parent?.appendChild(node);
  return node;
}

function buildBlueprint(svg){
  svg.textContent='';
  const defs=el('defs',{},svg);
  const filter=el('filter',{id:'bp-warp',filterUnits:'userSpaceOnUse',x:220,y:60,width:1160,height:840},defs);
  el('feTurbulence',{type:'fractalNoise',baseFrequency:'0.006 0.011',numOctaves:1,seed:7,result:'n'},filter);
  const displace=el('feDisplacementMap',{in:'SourceGraphic',in2:'n',scale:0,xChannelSelector:'R',yChannelSelector:'G'},filter);
  const root=el('g',{class:'bp-root'},svg);
  const guides=el('g',{class:'bp-guides'},root);
  const line=(x1,y1,x2,y2,strong=false)=>el('line',{x1,y1,x2,y2,pathLength:1,class:`bp-line${strong?' is-strong':''}`},guides);

  // Horizontal datum lines (cap height, bowl joints, baseline) — drawn alternately from left / right.
  const horizontals=[[245.6,true],[251.6],[342.5],[CY],[597.5],[688.4],[694.4,true]].map(([y,strong],i)=>
    i%2?line(1800,y,-200,y,strong):line(-200,y,1800,y,strong));
  // Vertical datum lines (stem edges, bowl start, counter, outer bowl).
  const verticals=[[560],[616,true],[622],[709],[715,true],[740.5],[932.6],[1032.9,true],[1090]].map(([x,strong],i)=>
    i%2?line(x,1200,x,-200,strong):line(x,-200,x,1200,strong));
  // Two long parallel bundles crossing behind the bowl — the drafting "legs".
  const diagonals=[];
  for(const [angle,dir] of [[62,1],[-62,-1]]){
    const r=angle*Math.PI/180,dx=Math.cos(r),dy=Math.sin(r),nx=-dy,ny=dx;
    for(const offset of [-11,-4,4,11]){
      const ox=CX+nx*offset,oy=CY+ny*offset,len=820;
      diagonals.push(dir>0?line(ox-dx*len,oy-dy*len,ox+dx*len,oy+dy*len):line(ox+dx*len,oy+dy*len,ox-dx*len,oy-dy*len));
    }
  }
  // Compass construction.
  const compass=el('g',{class:'bp-compass'},root);
  const dots=[234.6,134.3,330].map(r=>el('circle',{cx:CX,cy:CY,r,class:'bp-dot'},compass));
  for(const deg of [0,60,120]){
    const r=deg*Math.PI/180;
    dots.push(el('line',{x1:CX-Math.cos(r)*330,y1:CY-Math.sin(r)*330,x2:CX+Math.cos(r)*330,y2:CY+Math.sin(r)*330,class:'bp-dot'},compass));
  }
  // Measurement ticks + labels.
  const ticks=[];
  for(let y=245.6,i=0;y<=694.5;y+=22.44,i++)ticks.push(el('line',{x1:1118,y1:y,x2:i%5?1126:1136,y2:y,class:'bp-tick'},root));
  for(let x=616,i=0;x<=1033;x+=20.85,i++)ticks.push(el('line',{x1:x,y1:212,x2:x,y2:i%5?204:194,class:'bp-tick'},root));
  const labels=[
    [1144,250,'H 448'],[1144,474,'Ø 0.00'],[1144,698,'BASE'],[616,184,'STEM 99'],[940,184,'R 234.6 / 134.3'],[468,470,'D—01'],
  ].map(([x,y,text])=>{const t=el('text',{x,y,class:'bp-label'},root);t.textContent=text;return t;});
  const crosses=[[616,245.6],[1032.9,CY],[616,694.4],[CX,CY]].map(([x,y])=>el('path',{d:`M${x-7} ${y}H${x+7}M${x} ${y-7}V${y+7}`,class:'bp-cross'},root));
  // The mark itself: cyan / orange ghosts (for the chromatic split) under the white outline.
  const markGroup=el('g',{class:'bp-mark-group'},root);
  const layer=(cls)=>el('g',{class:cls},markGroup);
  const cyan=layer('bp-mark-layer-c'),orange=layer('bp-mark-layer-o'),white=layer('bp-mark-layer-w'),fill=layer('bp-mark-layer-f');
  const marks={c:[],o:[],w:[],f:[]};
  for(const d of MARK_PATHS){
    marks.c.push(el('path',{d,pathLength:1,class:'bp-mark bp-mark-c'},cyan));
    marks.o.push(el('path',{d,pathLength:1,class:'bp-mark bp-mark-o'},orange));
    marks.w.push(el('path',{d,pathLength:1,class:'bp-mark bp-mark-w'},white));
    marks.f.push(el('path',{d,class:'bp-fill'},fill));
  }
  return{root,displace,horizontals,verticals,diagonals,dots,ticks,labels,crosses,marks,layers:{cyan,orange,white}};
}

export function createIntro({reducedMotion=false,onReveal=()=>{},onProgress=()=>{},onComplete=()=>{}}={}){
  const html=document.documentElement,loader=document.getElementById('intro-loader');
  const skip=loader.querySelector('.intro-skip'),veil=loader.querySelector('.intro-veil'),stage=loader.querySelector('.intro-stage');
  const rings=[...loader.querySelectorAll('.intro-shock>i')],hudItems=[...loader.querySelectorAll('.intro-hud>span')];
  const motto=loader.querySelector('.intro-motto'),mottoOn=loader.querySelector('.intro-motto-on'),mottoOff=loader.querySelector('.intro-motto-off');
  const number=loader.querySelector('.intro-progress-number'),statusText=loader.querySelector('.intro-status-text');
  const status=loader.querySelector('.intro-status'),bar=loader.querySelector('[role=progressbar]');
  const bp=buildBlueprint(loader.querySelector('.intro-blueprint'));
  const allMarks=[...bp.marks.c,...bp.marks.o,...bp.marks.w];
  const animated=[stage,veil,motto,skip,...rings,...hudItems];
  const meter={value:0},reveal={value:0},lens={r:-80,soft:40};
  let disposed=false,finishing=false,completed=false,sceneReady=false,minimumPassed=reducedMotion;
  let entrance,idle,exit,revealTween,meterTween,minimumTimer,watchdog,scrambleTimer,lastNumber=-1;
  const statusSteps=[[0,'INITIALIZING'],[30,'DRAFTING GEOMETRY'],[64,'COMPILING OPTICS'],[92,'READY']];

  gsap.set(animated,{clearProps:'all'});
  setLens(-80,40);
  onProgress(0);updateMeter();
  loader.hidden=false;loader.removeAttribute('aria-hidden');
  html.classList.remove('intro-pending','intro-exiting');html.classList.add('intro-active');
  document.dispatchEvent(new Event('duvansi:intro-mounted'));

  function setLens(r,soft){
    lens.r=r;lens.soft=soft;
    veil.style.setProperty('--lens-r',`${r.toFixed(1)}px`);
    veil.style.setProperty('--lens-soft',`${soft.toFixed(1)}px`);
  }

  function setMotto(resolved){
    mottoOn.textContent=MOTTO_CHARS.slice(0,resolved).join('');
    mottoOff.textContent=MOTTO_CHARS.slice(resolved).map(ch=>ch===' '||ch==='.'?ch:CIPHER[Math.floor(Math.random()*CIPHER.length)]).join('');
  }

  function updateMeter(){
    const value=Math.min(100,Math.floor(meter.value));
    if(value===lastNumber)return;
    lastNumber=value;
    number.textContent=String(value).padStart(3,'0');
    bar.setAttribute('aria-valuenow',String(value));
    if(!finishing){
      let label=statusSteps[0][1];
      for(const [threshold,text] of statusSteps)if(value>=threshold)label=text;
      if(statusText.textContent!==label){statusText.textContent=label;status.textContent=`${label.toLowerCase()}.`;}
    }
  }

  function setProgress(value){
    if(disposed||finishing)return;
    const next=Math.max(meter.value,Math.min(sceneReady?100:96,Math.round(value*100)));
    meterTween?.kill();
    meterTween=gsap.to(meter,{value:next,duration:reducedMotion?.1:.5,ease:'power2.out',onUpdate:updateMeter});
  }

  function clearTimers(){clearTimeout(minimumTimer);clearTimeout(watchdog);clearInterval(scrambleTimer);scrambleTimer=null;}

  function hideLoaderDom(){
    if(completed||disposed)return;
    completed=true;clearTimers();entrance?.kill();idle?.kill();meterTween?.kill();
    loader.hidden=true;loader.setAttribute('aria-hidden','true');
    html.classList.remove('intro-pending','intro-active','intro-exiting');
    skip.removeEventListener('click',skipIntro);document.removeEventListener('keydown',keyboard);
    onComplete();
  }

  function drawnState(){
    gsap.set([...bp.horizontals,...bp.verticals,...bp.diagonals,...allMarks],{strokeDashoffset:0});
    gsap.set([...bp.dots,...bp.ticks,...bp.labels,...bp.crosses],{opacity:1});
    gsap.set(bp.marks.w,{stroke:'#ffffff'});
    gsap.set([...hudItems,skip],{opacity:1});
    mottoOn.textContent=MOTTO;mottoOff.textContent='';
  }

  function finish({immediate=false,skipped=false}={}){
    if(disposed||completed)return;
    if(finishing){if(immediate){exit?.kill();revealTween?.kill();onProgress(1);hideLoaderDom();}return;}
    finishing=true;clearTimers();meterTween?.kill();
    meter.value=100;updateMeter();statusText.textContent='ENTERING';status.textContent='Opening the spatial stage.';
    html.classList.remove('intro-active','intro-pending');html.classList.add('intro-exiting');
    onReveal({skipped});
    if(immediate||reducedMotion||document.hidden){entrance?.kill();idle?.kill();onProgress(1);hideLoaderDom();return;}

    // A skip still lets the drawing snap complete, so the lens always opens on a finished mark.
    if(skipped||entrance?.isActive()){entrance?.progress(1);entrance?.kill();drawnState();}
    idle?.kill();
    const fast=skipped?.55:1;
    const maxR=Math.hypot(innerWidth,innerHeight)*.62;
    bp.root.setAttribute('filter','url(#bp-warp)');
    const warp={scale:0};

    exit=gsap.timeline({onComplete:hideLoaderDom});
    // 1. Lock + chromatic split.
    exit.to(bp.marks.w,{stroke:'#ffffff',strokeWidth:2.2,duration:.18*fast,ease:'power2.out'},0)
      .to(bp.marks.f,{opacity:.92,duration:.14*fast,ease:'power2.out'},0)
      .to(bp.marks.f,{opacity:0,duration:.5*fast,ease:'power2.in'},.16*fast)
      .to([...bp.marks.c,...bp.marks.o],{opacity:1,duration:.12*fast},0)
      .to(bp.layers.cyan,{x:-7,y:-1,duration:.6*fast,ease:'expo.out'},.04*fast)
      .to(bp.layers.orange,{x:7,y:1,duration:.6*fast,ease:'expo.out'},.04*fast)
      .to([...bp.horizontals,...bp.verticals,...bp.diagonals],{stroke:'rgba(255,255,255,.55)',duration:.2*fast},0)
      .to([motto,...hudItems,skip],{opacity:0,y:-6,duration:.32*fast,ease:'power2.in',stagger:.02},.08*fast)
    // 2. Liquid warp + zoom-through of the blueprint.
      .to(warp,{scale:140,duration:1.05*fast,ease:'power2.in',onUpdate:()=>bp.displace.setAttribute('scale',String(Math.round(warp.scale)))},.22*fast)
      .to(stage,{scale:2.8,rotation:-4,opacity:0,duration:1.15*fast,ease:'expo.in'},.24*fast)
    // 3. The lens opens from the centre of the D.
      .to(lens,{r:maxR,soft:260,duration:1.25*fast,ease:'expo.inOut',onUpdate(){
        setLens(lens.r,lens.soft);
        const p=lens.r/maxR,fade=Math.sin(Math.min(1,p*1.15)*Math.PI);
        rings.forEach((ring,i)=>{
          const scale=Math.max(0,(lens.r+lens.soft*.35)*(1+(i-1)*.035))/100;
          ring.style.transform=`scale(${scale.toFixed(3)})`;
          ring.style.opacity=String((fade*(i===1?.75:.9)).toFixed(3));
        });
      }},.36*fast);

    revealTween=gsap.to(reveal,{value:1,duration:skipped?1.1:2.5,delay:.42*fast,ease:'power3.out',onUpdate:()=>onProgress(reveal.value)});
  }

  function maybeFinish(){if(sceneReady&&minimumPassed)finish();}
  function markReady(){if(disposed||finishing)return;sceneReady=true;setProgress(1);maybeFinish();}
  function skipIntro({immediate=false}={}){finish({skipped:true,immediate});}
  function keyboard(event){
    if(completed||disposed)return;
    if(event.key==='Escape'){event.preventDefault();skipIntro();}
    if(event.key==='Tab'){event.preventDefault();skip.focus({preventScroll:true});}
  }

  skip.addEventListener('click',skipIntro);document.addEventListener('keydown',keyboard);skip.focus({preventScroll:true});

  if(reducedMotion){
    drawnState();
  }else{
    setMotto(0);
    entrance=gsap.timeline();
    entrance.to(hudItems,{opacity:1,duration:.6,stagger:.08,ease:'power2.out'},.15)
      .to(skip,{opacity:1,duration:.5},.6)
      // Datum lines snap in first, like a CAD layout.
      .to(bp.horizontals,{strokeDashoffset:0,duration:1.15,stagger:.06,ease:'power3.inOut'},.05)
      .to(bp.verticals,{strokeDashoffset:0,duration:1.25,stagger:.05,ease:'expo.inOut'},.18)
      // Long diagonal bundles sweep across.
      .to(bp.diagonals,{strokeDashoffset:0,duration:1.35,stagger:.045,ease:'expo.inOut'},.38)
      // Compass + spokes.
      .fromTo(bp.dots,{opacity:0,scale:.82,rotation:-24,svgOrigin:`${CX} ${CY}`},{opacity:1,scale:1,rotation:0,duration:1.3,stagger:.07,ease:'expo.out'},.62)
      .to(bp.ticks,{opacity:1,duration:.25,stagger:.012,ease:'none'},.9)
      .to(bp.labels,{opacity:1,duration:.4,stagger:.08},1.15)
      // The mark draws itself.
      .to(bp.marks.w,{strokeDashoffset:0,duration:1.4,stagger:.16,ease:'power2.inOut'},.95)
      .set([...bp.marks.c,...bp.marks.o],{strokeDashoffset:0},2.5)
      // Lock: outline turns solid white, guides recede, crosshairs pop.
      .to(bp.marks.w,{stroke:'#ffffff',strokeWidth:1.8,duration:.35,ease:'power2.out'},2.55)
      .to([...bp.horizontals,...bp.verticals,...bp.diagonals],{stroke:'rgba(255,255,255,.22)',duration:.6},2.55)
      .fromTo(bp.crosses,{opacity:0,scale:0,transformOrigin:'50% 50%'},{opacity:1,scale:1,duration:.4,stagger:.05,ease:'back.out(2.4)'},2.6);
    idle=gsap.to(bp.dots.slice(0,3),{rotation:'+=360',svgOrigin:`${CX} ${CY}`,duration:60,repeat:-1,ease:'none',delay:2});

    const started=performance.now(),scrambleStart=250,scrambleDuration=2050;
    scrambleTimer=setInterval(()=>{
      const t=Math.max(0,Math.min(1,(performance.now()-started-scrambleStart)/scrambleDuration));
      setMotto(Math.floor(gsap.parseEase('power1.inOut')(t)*MOTTO.length));
      if(t===1){clearInterval(scrambleTimer);scrambleTimer=null;setMotto(MOTTO.length);}
    },42);
    minimumTimer=setTimeout(()=>{minimumPassed=true;maybeFinish();},3200);
  }
  watchdog=setTimeout(()=>finish({immediate:document.hidden}),10000);

  return{
    setProgress,
    waitFor(promise){Promise.resolve(promise).then(markReady,markReady);},
    skip:skipIntro,
    dispose(){
      if(disposed)return;disposed=true;clearTimers();entrance?.kill();idle?.kill();exit?.kill();revealTween?.kill();meterTween?.kill();
      gsap.set(animated,{clearProps:'all'});
      skip.removeEventListener('click',skipIntro);document.removeEventListener('keydown',keyboard);
      loader.hidden=true;loader.setAttribute('aria-hidden','true');
      html.classList.remove('intro-pending','intro-active','intro-exiting');
    },
  };
}
