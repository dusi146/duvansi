import gsap from 'gsap';
import './intro.css';

/** A small SVG title sequence shares the site's existing animation clock. */
export function createIntro({reducedMotion=false,onReveal=()=>{},onProgress=()=>{},onComplete=()=>{}}={}){
  const html=document.documentElement,loader=document.getElementById('intro-loader');
  const pieces=[...loader.querySelectorAll('.intro-piece')],outlines=loader.querySelectorAll('.intro-outline'),fills=loader.querySelectorAll('.intro-fill');
  const sheen=loader.querySelector('.intro-sheen'),center=loader.querySelector('.intro-center'),skip=loader.querySelector('.intro-skip');
  const status=loader.querySelector('.intro-status'),number=loader.querySelector('.intro-progress-number'),line=loader.querySelector('.intro-progress-line'),bar=loader.querySelector('[role=progressbar]'),caption=loader.querySelector('.intro-scramble');
  const animated=[...pieces,...outlines,...fills,sheen,center,...loader.querySelectorAll('.intro-caption,.intro-corner-coordinate,.intro-top,.intro-bottom,.intro-panels>i,.intro-regmark')];
  const meter={value:0},reveal={value:0};
  let disposed=false,finishing=false,completed=false,sceneReady=false,minimumPassed=reducedMotion,entrance,exit,meterTween,minimumTimer,watchdog,scrambleTimer,lastNumber=-1;
  const text='AN INDEPENDENT CREATIVE WORLD',alphabet='DUVANSI/0123456789',started=performance.now();
  gsap.set(animated,{clearProps:'all'});meter.value=0;updateMeter();status.textContent='Preparing your world.';
  loader.hidden=false;loader.removeAttribute('aria-hidden');html.classList.remove('intro-pending','intro-exiting');html.classList.add('intro-active');
  document.dispatchEvent(new Event('duvansi:intro-mounted'));
  function updateMeter(){
    const value=Math.min(100,Math.floor(meter.value));if(value===lastNumber)return;lastNumber=value;number.textContent=String(value).padStart(3,'0');bar.setAttribute('aria-valuenow',String(value));line.style.transform=`scaleX(${meter.value/100})`;
  }
  function setProgress(value){
    if(disposed||finishing)return;
    const next=Math.max(meter.value,Math.min(sceneReady?100:96,Math.round(value*100)));
    meterTween?.kill();meterTween=gsap.to(meter,{value:next,duration:reducedMotion?.12:.45,ease:'power1.out',onUpdate:updateMeter});
  }
  function clearTimers(){clearTimeout(minimumTimer);clearTimeout(watchdog);clearInterval(scrambleTimer);scrambleTimer=null;}
  function complete(){
    if(completed||disposed)return;completed=true;clearTimers();entrance?.kill();meterTween?.kill();loader.hidden=true;loader.setAttribute('aria-hidden','true');html.classList.remove('intro-pending','intro-active','intro-exiting');
    skip.removeEventListener('click',skipIntro);document.removeEventListener('keydown',keyboard);onProgress(1);onComplete();
  }
  function finish({immediate=false,skipped=false}={}){
    if(disposed||completed)return;
    if(finishing){if(immediate){exit?.kill();complete();}return;}
    finishing=true;clearTimers();meterTween?.kill();entrance?.kill();meter.value=100;updateMeter();caption.textContent=text;status.textContent='Ready to explore.';
    html.classList.remove('intro-active','intro-pending');html.classList.add('intro-exiting');onReveal({skipped});
    if(immediate||reducedMotion||document.hidden){onProgress(1);complete();return;}
    const duration=skipped?.55:1.05;
    exit=gsap.timeline({onComplete:complete});
    exit.to([center,loader.querySelector('.intro-caption'),loader.querySelector('.intro-corner-coordinate')],{opacity:0,y:-12,duration:skipped?.2:.45,ease:'power2.in'},0);
    exit.to([loader.querySelector('.intro-top'),loader.querySelector('.intro-bottom')],{opacity:0,duration:skipped?.15:.3},.05);
    exit.to(loader.querySelectorAll('.intro-panels>i'),{scaleY:0,duration,stagger:skipped?.04:.09,ease:'expo.inOut'},skipped?.08:.22);
    exit.to(reveal,{value:1,duration:duration+.12,ease:'power3.out',onUpdate:()=>onProgress(reveal.value)},skipped?0:.2);
  }
  function maybeFinish(){if(sceneReady&&minimumPassed)finish();}
  function markReady(){if(disposed||finishing)return;sceneReady=true;status.textContent='Opening your world.';setProgress(1);maybeFinish();}
  function skipIntro({immediate=false}={}){finish({skipped:true,immediate});}
  function keyboard(event){
    if(completed||disposed)return;
    if(event.key==='Escape'){event.preventDefault();skipIntro();}
    if(event.key==='Tab'){event.preventDefault();skip.focus({preventScroll:true});}
  }
  skip.addEventListener('click',skipIntro);document.addEventListener('keydown',keyboard);skip.focus({preventScroll:true});
  if(reducedMotion){gsap.set(outlines,{strokeDashoffset:0});gsap.set(fills,{opacity:.72});caption.textContent=text;}
  else{
    gsap.set(pieces[0],{x:-15,y:8});gsap.set(pieces[1],{x:12,y:-18});gsap.set(pieces[2],{x:10,y:17});
    entrance=gsap.timeline();
    entrance.from(loader.querySelectorAll('.intro-regmark'),{opacity:0,scale:.6,duration:.55,stagger:.08},.08)
      .to(pieces,{x:0,y:0,duration:1.35,stagger:.12,ease:'power3.out'},.15)
      .to(outlines,{strokeDashoffset:0,duration:1.5,stagger:.13,ease:'power2.inOut'},.15)
      .to(fills,{opacity:.86,duration:.65,stagger:.08,ease:'power2.out'},1.35)
      .to(sheen,{opacity:.8,duration:.2},1.65)
      .to(sheen,{x:460,duration:1.0,ease:'power2.inOut'},1.6)
      .to(sheen,{opacity:0,duration:.2},2.45);
    scrambleTimer=setInterval(()=>{
      const progress=Math.min(1,(performance.now()-started)/1900),resolved=Math.floor(progress*text.length);
      caption.textContent=[...text].map((character,index)=>character===' '||index<resolved?character:alphabet[Math.floor(Math.random()*alphabet.length)]).join('');
      if(progress===1){clearInterval(scrambleTimer);scrambleTimer=null;}
    },65);
    minimumTimer=setTimeout(()=>{minimumPassed=true;maybeFinish();},2750);
  }
  watchdog=setTimeout(()=>finish({immediate:document.hidden}),9000);
  return{
    setProgress,
    waitFor(promise){Promise.resolve(promise).then(markReady,markReady);},
    skip:skipIntro,
    dispose(){if(disposed)return;disposed=true;clearTimers();entrance?.kill();exit?.kill();meterTween?.kill();gsap.set(animated,{clearProps:'all'});skip.removeEventListener('click',skipIntro);document.removeEventListener('keydown',keyboard);loader.hidden=true;loader.setAttribute('aria-hidden','true');html.classList.remove('intro-pending','intro-active','intro-exiting');},
  };
}
