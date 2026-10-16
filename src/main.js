import './style.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { projects, featured } from './projects.js';
import { createWorld } from './world.js';
import { createIntro } from './intro.js';

gsap.registerPlugin(ScrollTrigger);
const html=document.documentElement;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const fine=matchMedia('(pointer:fine) and (min-width:601px)');
let intro,loadProgress=0;
const world=createWorld({onLoadProgress(value){loadProgress=value;intro?.setProgress(value);}});
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const sections=$$('[data-chapter]');
const menu=$('#navigation-panel'),menuButton=$('.menu-toggle');
const projectDialog=$('#project-dialog'),indexDialog=$('#index-dialog');
const ui={
  scrollProgress:$('.scroll-progress'),header:$('.site-header'),chapterLinks:$$('[data-chapter-link]'),
  journeyMeter:$('.journey-meter>span'),journey:$('.hero-journey'),exploreLabel:$('.explore-label'),
  journeyNumber:$('.journey-number'),journeyName:$('.journey-name'),journeyTitle:$('.journey-title'),
  workNumber:$('.work-number'),workKind:$('.work-kind'),workName:$('.work-name'),workDescription:$('.work-description'),
  workHit:$('.work-hit'),featuredButtons:$$('[data-featured]'),workPrev:$('.work-prev'),workNext:$('.work-next'),
};
const cleanup=[],timeouts=new Set(),dialogs=new Set(),inertElements=new Map();
let requested=true,enabled=false,initialized=false,disposed=false;
try{requested=sessionStorage.getItem('duvansi:spatial-motion')!=='off';}catch{}
let lenis,ticker,animationContext,pointerCleanup;
let updateFrame=0,layoutFrame=0,measurements=[],measuredById={},activeFeatured=-1;
let viewportHeight=innerHeight,scrollRange=1,lastScrollY=-1,lastChapter='',lastTheme='',headerScrolled=false,lastExploreComplete=null,lastJourneyProgress='',lastOriginProgress=-1;
let menuOpen=false,menuPreviousFocus,savedOverflow=null,copyTimeout,introActive=true,heroEntrance,allowIntroAnchor=true;
const introInert=new Map(),previousRestoration=history.scrollRestoration;
const mainContent=$('#main-content'),previousBusy=mainContent.getAttribute('aria-busy');
let activeJourney=-1,journeyAnimation;
const journey=[
  {name:'FORM',title:'An idea takes shape.'},
  {name:'PERSPECTIVE',title:'Shift the way you see.'},
  {name:'DECONSTRUCTION',title:'Break it. Find the essence.'},
  {name:'CONNECTION',title:'Everything comes together.'},
];
const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,value));
function on(target,event,handler,options){target.addEventListener(event,handler,options);cleanup.push(()=>target.removeEventListener(event,handler,options));}
function later(fn,delay){const id=setTimeout(()=>{timeouts.delete(id);if(!disposed)fn();},delay);timeouts.add(id);return id;}
function measure(){
  if(disposed)return;
  viewportHeight=innerHeight;
  measurements=sections.map(section=>({section,id:section.id,top:section.offsetTop,height:section.offsetHeight}));
  measuredById=Object.fromEntries(measurements.map(item=>[item.id,item]));
  scrollRange=Math.max(1,html.scrollHeight-viewportHeight);
  lastScrollY=-1;
  update();
}
function queueUpdate(){if(!updateFrame&&!disposed)updateFrame=requestAnimationFrame(()=>{updateFrame=0;update();});}
function queueMeasure(){if(!layoutFrame&&!disposed)layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;if(enabled)ScrollTrigger.refresh();measure();});}
function update(){
  if(disposed||!measurements.length)return;
  const y=scrollY,vh=viewportHeight;
  if(y===lastScrollY)return;
  lastScrollY=y;
  ui.scrollProgress.style.transform=`scaleX(${clamp(y/scrollRange)})`;
  const scrolled=y>50;
  if(scrolled!==headerScrolled){headerScrolled=scrolled;ui.header.classList.toggle('is-scrolled',scrolled);}
  let chapter=measurements[0],current=measurements[0];
  for(const item of measurements){if(item.top<=y+vh*.3)chapter=item;if(item.top<=y+vh*.12)current=item;}
  if(chapter.id!==lastChapter){
    lastChapter=chapter.id;
    ui.chapterLinks.forEach(link=>{const active=link.dataset.chapterLink===chapter.id;link.classList.toggle('is-active',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
  }
  const {work,vision,about}=measuredById;
  const workProgress=clamp((y-work.top)/Math.max(1,work.height-vh));
  const progress=clamp((y-current.top)/Math.max(vh*.5,current.height-vh));
  const light=clamp((y-(vision.top-vh*.45))/(vh*.6))*(1-clamp((y-(about.top-vh*.4))/(vh*.55)));
  const nextTheme=light>.5?'light':'dark';
  if(nextTheme!==lastTheme){lastTheme=nextTheme;html.dataset.theme=nextTheme;}
  world.setState({phase:current.id,progress,workProgress,theme:light});
  const origin=measurements[0],originProgress=clamp((y-origin.top)/Math.max(1,origin.height-vh));
  const journeyIndex=originProgress<.22?0:originProgress<.46?1:originProgress<.72?2:3;
  if(originProgress!==lastOriginProgress){lastOriginProgress=originProgress;ui.journeyMeter.style.transform=`scaleX(${originProgress})`;}
  const roundedProgress=originProgress.toFixed(3);
  if(roundedProgress!==lastJourneyProgress){lastJourneyProgress=roundedProgress;ui.journey.dataset.progress=roundedProgress;}
  const exploreComplete=originProgress>.9;
  if(exploreComplete!==lastExploreComplete){lastExploreComplete=exploreComplete;ui.exploreLabel.textContent=exploreComplete?'Enter selected work':'Scroll to unfold';}
  if(activeJourney!==journeyIndex){
    activeJourney=journeyIndex;ui.journeyNumber.textContent=String(journeyIndex+1).padStart(2,'0');ui.journeyName.textContent=journey[journeyIndex].name;ui.journeyTitle.textContent=journey[journeyIndex].title;
    journeyAnimation?.kill();if(enabled)journeyAnimation=gsap.fromTo([ui.journeyTitle,ui.journeyName],{opacity:0,y:8,filter:'blur(5px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.7,stagger:.06,clearProps:'opacity,transform,filter'});
  }
  if(current.id==='work'&&!reduced.matches)setFeatured(Math.round(workProgress*(featured.length-1)));
}
function setFeatured(index){
  index=clamp(index,0,featured.length-1);if(index===activeFeatured)return;activeFeatured=index;
  const project=featured[index];
  ui.workNumber.textContent=String(index+1).padStart(2,'0');
  ui.workKind.textContent=project.discipline.split(' / ')[0].toUpperCase();
  ui.workName.textContent=project.name;
  ui.workDescription.textContent=project.strapline;
  ui.workHit.setAttribute('aria-label',`View ${project.name}`);
  ui.featuredButtons.forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.featured)===index)));
  ui.workPrev.disabled=index===0;ui.workNext.disabled=index===featured.length-1;
}
function goFeatured(index){
  index=clamp(index,0,featured.length-1);
  const section=$('#work'),y=section.offsetTop+Math.max(0,section.offsetHeight-innerHeight)*(index/(featured.length-1));
  setFeatured(index);
  if(lenis&&enabled)lenis.scrollTo(y,{duration:1});else{window.scrollTo({top:y,behavior:'instant'});queueUpdate();}
}
function focusTarget(target){const existing=target.getAttribute('tabindex');target.setAttribute('tabindex','-1');target.focus({preventScroll:true});target.addEventListener('blur',()=>{if(existing===null)target.removeAttribute('tabindex');else target.setAttribute('tabindex',existing);},{once:true});}
function scrollTarget(target,focus=false){
  const top=Math.max(0,target.getBoundingClientRect().top+scrollY);
  if(lenis&&enabled)lenis.scrollTo(top,{duration:1.1,onComplete:()=>{if(focus)focusTarget(target);}});
  else{window.scrollTo({top,behavior:'instant'});queueUpdate();if(focus)focusTarget(target);}
}
function syncLock(){
  const overlayOpen=menuOpen||dialogs.size>0,lock=introActive||overlayOpen;
  world.setOccluded(overlayOpen);
  if(lock&&savedOverflow===null){savedOverflow=[html.style.overflow,document.body.style.overflow];html.style.overflow='hidden';document.body.style.overflow='hidden';lenis?.stop();}
  if(!lock&&savedOverflow!==null){[html.style.overflow,document.body.style.overflow]=savedOverflow;savedOverflow=null;if(enabled)lenis?.start();}
}
function closeMenu(restoreFocus=true){
  if(!menuOpen)return;menuOpen=false;menu.hidden=true;html.classList.remove('menu-open');menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Open navigation');
  for(const [element,value] of inertElements)element.inert=value;inertElements.clear();syncLock();
  if(restoreFocus&&menuPreviousFocus?.isConnected)menuPreviousFocus.focus({preventScroll:true});
}
function openMenu(){
  menuPreviousFocus=document.activeElement;menuOpen=true;menu.hidden=false;html.classList.add('menu-open');menuButton.setAttribute('aria-expanded','true');menuButton.setAttribute('aria-label','Close navigation');
  for(const element of $$('main,.chapter-nav,.bottom-hud,.brand,.desktop-nav,.contact-link,.skip-link')){inertElements.set(element,element.inert);element.inert=true;}
  syncLock();menu.querySelector('a').focus({preventScroll:true});
}
on(menuButton,'click',()=>menuOpen?closeMenu():openMenu());
on(document,'keydown',event=>{
  if(!menuOpen)return;
  if(event.key==='Escape'){event.preventDefault();closeMenu();}
  if(event.key==='Tab'){
    const items=[menuButton,...menu.querySelectorAll('a,button')].filter(element=>element.getClientRects().length);
    const first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
projectDialog.querySelector('h2').id='project-detail-title';projectDialog.setAttribute('aria-labelledby','project-detail-title');
indexDialog.querySelector('h2').id='project-index-title';indexDialog.setAttribute('aria-labelledby','project-index-title');
function showDialog(dialog){closeMenu(false);if(!dialog.open){dialog.showModal();dialogs.add(dialog);}syncLock();}
function openProject(project){
  const art=$('.project-dialog-art');art.replaceChildren();art.style.background=project.color;
  if(project.art){const image=new Image();image.src=project.art;image.alt=`${project.name} visual design study`;art.append(image);}
  else{const type=document.createElement('span');type.className='dialog-type-art';type.textContent=project.short;art.append(type);}
  $('.dialog-category').textContent=`${project.year} / ${project.discipline.toUpperCase()}`;
  $('.dialog-title').textContent=project.name;$('.dialog-description').textContent=project.description;
  $('.dialog-facts').replaceChildren();
  for(const [term,definition] of [['DISCIPLINE',project.discipline],['YEAR',project.year],['LOCATION','Vietnam']]){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=term;dd.textContent=definition;row.append(dt,dd);$('.dialog-facts').append(row);}
  showDialog(projectDialog);projectDialog.scrollTop=0;
}
for(const dialog of [projectDialog,indexDialog]){
  on(dialog.querySelector('.dialog-close'),'click',()=>dialog.close());
  on(dialog,'close',()=>{dialogs.delete(dialog);syncLock();queueMeasure();});
  on(dialog,'click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
}
$('.index-list').replaceChildren();
for(const [index,project] of projects.entries()){
  const details=document.createElement('details');details.className='index-project';details.dataset.category=project.category;
  const summary=document.createElement('summary');
  summary.innerHTML=`<span class="index-number">${String(index+1).padStart(2,'0')}</span><span class="index-thumb" style="--project-color:${project.color}">${project.art?`<img src="${project.art}" alt="" loading="lazy"/>`:project.short}</span><span class="index-name">${project.name}<small>${project.discipline}</small></span><span class="index-year">${project.year}</span><span class="index-plus" aria-hidden="true">+</span>`;
  const brief=document.createElement('div');brief.className='index-brief';const p=document.createElement('p');p.textContent=project.description;
  const button=document.createElement('button');button.type='button';button.className='text-link';button.innerHTML='Open visual study <span>↗</span>';on(button,'click',()=>openProject(project));
  brief.append(p,button);details.append(summary,brief);$('.index-list').append(details);
  on(details,'toggle',()=>{if(details.open)$$('.index-project[open]').forEach(other=>{if(other!==details)other.open=false;});});
}
on($('.index-open'),'click',()=>showDialog(indexDialog));
for(const button of $$('[data-filter]'))on(button,'click',()=>{
  const filter=button.dataset.filter;$$('[data-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  let count=0;for(const item of $$('.index-project')){item.hidden=filter!=='all'&&item.dataset.category!==filter;if(item.hidden)item.open=false;else count++;}$('.index-count').textContent=String(count).padStart(2,'0');
});
for(const button of $$('.project-open,.work-hit'))on(button,'click',()=>openProject(featured[activeFeatured]));
on($('.work-prev'),'click',()=>goFeatured(activeFeatured-1));on($('.work-next'),'click',()=>goFeatured(activeFeatured+1));
for(const button of $$('[data-featured]'))on(button,'click',()=>goFeatured(Number(button.dataset.featured)));
for(const [index,image] of $$('.static-projects img').entries()){
  let button=image.parentElement;
  if(button.tagName!=='BUTTON'){
    button=document.createElement('button');button.type='button';image.replaceWith(button);const label=document.createElement('span');label.textContent=featured[index].name;button.append(image,label);
  }
  button.setAttribute('aria-label',`View ${featured[index].name}`);on(button,'click',()=>openProject(featured[index]));
}
on($('.atmosphere-toggle'),'click',()=>{const palette=world.cycleAtmosphere();$('.atmosphere-toggle').setAttribute('aria-label',`Change lighting atmosphere. Current: ${['Acid','Violet','Copper'][palette]||'Acid'}`);});
on($('.explore-link'),'click',event=>{
  if(reduced.matches||!html.classList.contains('scene-ready'))return;
  const section=$('#origin'),range=Math.max(1,section.offsetHeight-innerHeight),progress=clamp((scrollY-section.offsetTop)/range);
  const next=[.26,.51,.78,.91].find(stop=>stop>progress+.04);
  if(next===undefined)return;
  event.preventDefault();event.stopPropagation();const top=section.offsetTop+range*next;
  if(lenis&&enabled)lenis.scrollTo(top,{duration:1.65});else{window.scrollTo({top,behavior:'instant'});queueUpdate();}
});
function startPointer(){
  if(!fine.matches||!enabled)return;
  const cursor=$('.custom-cursor'),label=cursor.querySelector('span');let visible=false,pointerFrame=0,pointerX=0,pointerY=0,hoverLabel='',nextLabel='';
  gsap.set(cursor,{xPercent:-50,yPercent:-50,opacity:0});
  cursor.classList.remove('is-active');label.textContent='';
  const x=gsap.quickTo(cursor,'x',{duration:.22,ease:'power3'}),y=gsap.quickTo(cursor,'y',{duration:.22,ease:'power3'});
  const flushPointer=()=>{
    pointerFrame=0;
    if(!visible){gsap.set(cursor,{x:pointerX,y:pointerY,opacity:1});html.classList.add('has-cursor');visible=true;}
    x(pointerX);y(pointerY);
    if(nextLabel!==hoverLabel){hoverLabel=nextLabel;cursor.classList.toggle('is-active',Boolean(hoverLabel));label.textContent=hoverLabel;}
  };
  const move=event=>{
    if(event.pointerType==='touch')return;
    pointerX=event.clientX;pointerY=event.clientY;nextLabel=event.target.closest?.('[data-cursor]')?.dataset.cursor||'';
    if(!pointerFrame)pointerFrame=requestAnimationFrame(flushPointer);
  };
  const hide=()=>{cancelAnimationFrame(pointerFrame);pointerFrame=0;visible=false;html.classList.remove('has-cursor');gsap.set(cursor,{opacity:0});};
  const keyboard=event=>{if(event.key==='Tab')hide();};
  window.addEventListener('pointermove',move,{passive:true});document.addEventListener('pointerleave',hide);window.addEventListener('blur',hide);document.addEventListener('keydown',keyboard);
  pointerCleanup=()=>{window.removeEventListener('pointermove',move);document.removeEventListener('pointerleave',hide);window.removeEventListener('blur',hide);document.removeEventListener('keydown',keyboard);x.tween.kill();y.tween.kill();hide();};
}
function startMotion(){
  lenis=new Lenis({duration:1.05,smoothWheel:true,syncTouch:false,anchors:false});lenis.on('scroll',ScrollTrigger.update);ticker=time=>lenis.raf(time*1000);gsap.ticker.add(ticker);if(savedOverflow!==null)lenis.stop();
  animationContext=gsap.context(()=>{
    if(!introActive&&!initialized&&scrollY<innerHeight*.3)gsap.from('.hero-top,.hero-bottom,.hero-coordinate',{opacity:0,y:15,duration:1.2,stagger:.12,delay:.2,clearProps:'opacity,transform'});
    for(const element of $$('[data-reveal]')){if(initialized&&element.getBoundingClientRect().top<innerHeight*.95)continue;gsap.from(element,{opacity:0,y:25,duration:1,ease:'power2.out',clearProps:'opacity,transform',scrollTrigger:{trigger:element,start:'top 92%',once:true}});}
  });
  startPointer();ScrollTrigger.refresh();
}
function stopMotion(){pointerCleanup?.();pointerCleanup=null;journeyAnimation?.progress(1).kill();journeyAnimation=null;heroEntrance?.progress(1).kill();heroEntrance=null;animationContext?.revert();animationContext=null;if(ticker)gsap.ticker.remove(ticker);ticker=null;lenis?.destroy();lenis=null;}
function applyMotion(){
  const next=requested&&!reduced.matches;html.classList.toggle('motion-paused',!next);html.classList.toggle('reduced-motion',reduced.matches);
  $('.motion-toggle').setAttribute('aria-pressed',String(next));$('.motion-toggle').disabled=reduced.matches;
  $('.motion-toggle').setAttribute('aria-label',reduced.matches?'Animations follow your reduced motion preference':next?'Pause animations':'Enable animations');$('.motion-label').textContent=next?'Motion on':'Motion off';
  if(next!==enabled||!initialized){stopMotion();enabled=next;world.setMotion(next);if(next)startMotion();}
  initialized=true;measure();
}
on($('.motion-toggle'),'click',()=>{requested=!requested;try{sessionStorage.setItem('duvansi:spatial-motion',requested?'on':'off');}catch{}applyMotion();});
on(reduced,'change',()=>{applyMotion();if(reduced.matches)intro?.skip({immediate:true});});on(fine,'change',()=>{pointerCleanup?.();pointerCleanup=null;startPointer();});
on(document,'click',event=>{
  const link=event.target.closest('a[href^="#"]');if(!link)return;const id=decodeURIComponent(link.getAttribute('href').slice(1)),target=document.getElementById(id);if(!target)return;
  event.preventDefault();closeMenu(false);if(location.hash!==`#${id}`)history.pushState(null,'',`#${id}`);scrollTarget(target,true);
});
on($('.back-top'),'click',()=>{history.replaceState(null,'','#origin');scrollTarget($('#origin'),true);});
on($('.copy-email'),'click',async()=>{
  if(copyTimeout){clearTimeout(copyTimeout);timeouts.delete(copyTimeout);}
  try{await navigator.clipboard.writeText('pdt.146@gmail.com');$('.copy-label').textContent='COPIED';$('.copy-status').textContent='Email address copied.';}
  catch{$('.copy-label').textContent='EMAIL';$('.copy-status').textContent='pdt.146@gmail.com';}
  copyTimeout=later(()=>{$('.copy-label').textContent='COPY';$('.copy-status').textContent='';},3000);
});
const localTime=$('.local-time'),clockFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hour12:false});
function updateClock(){const time=clockFormat.format(new Date());if(localTime.textContent!==time)localTime.textContent=time;}
updateClock();const clockTimer=setInterval(updateClock,15000);
on(window,'scroll',queueUpdate,{passive:true});on(window,'resize',queueMeasure,{passive:true});on(window,'load',queueMeasure);
const observer=new ResizeObserver(queueMeasure);observer.observe($('main'));
function restoreIntroInert(){for(const [element,value] of introInert)element.inert=value;introInert.clear();if(previousBusy===null)mainContent.removeAttribute('aria-busy');else mainContent.setAttribute('aria-busy',previousBusy);}
function alignIntroDestination(){
  if(disposed||!allowIntroAnchor)return;measure();let id='origin';try{id=decodeURIComponent(location.hash.slice(1))||'origin';}catch{}
  const target=document.getElementById(id)||$('#origin'),top=target.getBoundingClientRect().top+scrollY;
  if(lenis&&enabled)lenis.scrollTo(top,{immediate:true,force:true});else window.scrollTo({top,behavior:'instant'});
  measure();focusTarget(target);
}
history.scrollRestoration='manual';mainContent.setAttribute('aria-busy','true');
for(const element of $$('main,.site-header,.chapter-nav,.bottom-hud,.skip-link')){introInert.set(element,element.inert);element.inert=true;}
world.setIntroProgress(0);
setFeatured(0);applyMotion();measure();syncLock();document.fonts?.ready.then(queueMeasure);
intro=createIntro({
  reducedMotion:reduced.matches||!requested,
  onReveal(){if(disposed)return;if(enabled)heroEntrance=gsap.fromTo('.site-header,.hero-top,.hero-bottom,.hero-coordinate,.hero-journey,.chapter-nav,.bottom-hud',{opacity:0,y:13},{opacity:1,y:0,duration:.9,stagger:.055,delay:.3,ease:'power2.out',clearProps:'opacity,transform'});},
  onProgress:world.setIntroProgress,
  onComplete(){if(disposed)return;introActive=false;restoreIntroInert();history.scrollRestoration=previousRestoration;syncLock();alignIntroDestination();queueMeasure();},
});
intro.setProgress(loadProgress);intro.waitFor(world.ready);
world.ready.then(()=>{if(disposed)return;queueMeasure();if(!introActive)alignIntroDestination();});
const stopIntroAnchor=()=>{if(!introActive)allowIntroAnchor=false;};
on(window,'wheel',stopIntroAnchor,{passive:true});on(window,'touchstart',stopIntroAnchor,{passive:true});
on(window,'keydown',event=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key))stopIntroAnchor();});
if(import.meta.hot)import.meta.hot.dispose(()=>{
  intro?.dispose();heroEntrance?.kill();introActive=false;restoreIntroInert();history.scrollRestoration=previousRestoration;closeMenu(false);for(const dialog of dialogs)dialog.close();dialogs.clear();syncLock();disposed=true;stopMotion();observer.disconnect();cleanup.forEach(fn=>fn());timeouts.forEach(clearTimeout);clearInterval(clockTimer);cancelAnimationFrame(updateFrame);cancelAnimationFrame(layoutFrame);world.dispose();html.classList.remove('motion-paused','reduced-motion');delete html.dataset.theme;
});
