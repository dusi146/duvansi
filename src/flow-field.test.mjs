import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFlowField } from './flow-field.js';

// Record submitted passes without creating a WebGL context. Real Three.js
// resources and DOM EventTargets exercise the public field lifecycle.
class FakeRenderer {
  capabilities={maxSamples:4};
  calls=[];
  target=null;
  clearColor=new THREE.Color('#090b0c');
  clearAlpha=1;
  getRenderTarget(){return this.target;}
  setRenderTarget(target){this.target=target;this.calls.push({type:'target',target});}
  getClearAlpha(){return this.clearAlpha;}
  getClearColor(target){return target.copy(this.clearColor);}
  setClearColor(color,alpha){this.clearColor.copy(color);this.clearAlpha=alpha;}
  clear(){this.calls.push({type:'clear',target:this.target});}
  render(scene,camera){this.calls.push({type:'render',scene,camera,target:this.target});}
  compileAsync(scene,camera){this.calls.push({type:'compile',scene,camera,target:this.target});return Promise.resolve();}
  reset(){this.calls.length=0;}
  get renders(){return this.calls.filter(call=>call.type==='render');}
}

function fixture(t){
  const descriptors=new Map(['window','document'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const window=new EventTarget(),document=new EventTarget();
  Object.defineProperty(globalThis,'window',{value:window,configurable:true});
  Object.defineProperty(globalThis,'document',{value:document,configurable:true});
  const renderer=new FakeRenderer(),field=createFlowField(renderer);
  const scene=new THREE.Scene(),camera=new THREE.Camera(),accent=new THREE.Color('#d5ff4f');
  field.resize(1280,720,1,false);
  renderer.reset();
  t.after(()=>{
    field.dispose();
    for(const [name,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
  });
  const dispatch=(type,properties={})=>{
    const event=new Event(type);
    Object.assign(event,{clientX:640,clientY:360,pointerType:'mouse',button:0},properties);
    window.dispatchEvent(event);
  };
  let time=0;
  const update=(delta=1/60)=>{time+=delta;field.update(delta,time,accent,0);};
  const render=()=>field.render(scene,camera);
  return{field,renderer,scene,camera,dispatch,update,render};
}

function assertDirectFrame(f){
  const draws=f.renderer.renders;
  assert.equal(draws.length,1,'the scene needs one direct draw');
  assert.equal(draws[0].scene,f.scene);
  assert.equal(draws[0].target,null,'the scene renders directly to the screen');
  assert.ok(f.renderer.calls.every(call=>call.type!=='target'||call.target===null),'idle frames submit no offscreen target');
  assert.ok(f.renderer.calls.every(call=>call.type!=='clear'),'idle frames do not repeatedly clear the field');
}

function assertFullFrame(f){
  const draws=f.renderer.renders;
  assert.equal(draws.length,3,'an active frame simulates, captures, then composites');
  assert.notEqual(draws[0].scene,f.scene,'the first draw is the flow simulation');
  assert.ok(draws[0].target,'simulation writes offscreen');
  assert.equal(draws[1].scene,f.scene,'the second draw captures the complete scene');
  assert.ok(draws[1].target);
  assert.notEqual(draws[0].target,draws[1].target,'simulation and scene capture use separate targets');
  assert.notEqual(draws[2].scene,f.scene,'the final draw composites the distortion and ripples');
  assert.equal(draws[2].target,null);
  assert.equal(f.field.processing,true);
}

test('untouched frames skip simulation, capture and composite',t=>{
  const f=fixture(t);
  for(let frame=0;frame<8;frame++){
    f.renderer.reset();f.update();f.render();
    assert.equal(f.field.processing,false);
    assertDirectFrame(f);
  }
});

test('pointer movement activates every flow pass on its first frame',t=>{
  const f=fixture(t);
  f.dispatch('pointermove',{clientX:320,clientY:240});
  f.update();f.render();
  assertFullFrame(f);
});

test('a click activates simulation and the expanding ripple immediately',t=>{
  const f=fixture(t);
  f.dispatch('pointerdown',{clientX:960,clientY:180});
  f.update();f.render();
  assertFullFrame(f);
  const composite=f.renderer.renders[2].scene.children[0].material.uniforms;
  const ripple=composite.uRipples.value.find(item=>item.w>0);
  assert.ok(ripple,'the composite receives an active click ripple');
  assert.equal(ripple.x,.75);assert.equal(ripple.y,.75);
  assert.ok(ripple.z>0&&ripple.z<.1,'the ripple begins at its first animation frame');
});

test('trails keep animating, then return to the direct path after fading',t=>{
  const f=fixture(t);
  f.dispatch('pointermove');f.update();
  f.update(.5);
  assert.equal(f.field.processing,true,'a visible trail survives after input stops');
  for(let frame=0;frame<160;frame++)f.update();
  assert.equal(f.field.processing,false,'the fully faded trail releases the extra passes');
  for(let frame=0;frame<8;frame++){
    f.renderer.reset();f.update();f.render();assertDirectFrame(f);
  }
});

test('blocking ignores move and click input, and unblocking restores effects',t=>{
  const f=fixture(t);
  f.field.setBlocked(true);
  f.dispatch('pointermove');f.dispatch('pointerdown');
  f.update();f.render();assertDirectFrame(f);
  assert.equal(f.field.processing,false);
  f.field.setBlocked(false);f.renderer.reset();
  f.dispatch('pointermove');f.update();f.render();assertFullFrame(f);
});

test('blocking preserves the current fade without extending it with new input',t=>{
  const f=fixture(t);
  f.dispatch('pointerdown');f.update();f.update(2.5);
  assert.equal(f.field.processing,true);
  f.field.setBlocked(true);
  f.dispatch('pointermove',{clientX:900});f.dispatch('pointerdown');
  f.update(.2);
  assert.equal(f.field.processing,true,'blocking does not abruptly remove an existing trail');
  f.update(.4);
  assert.equal(f.field.processing,false,'blocked input cannot restart the fade timer');
  f.renderer.reset();f.render();assertDirectFrame(f);
});

test('a quality-only resolution resize preserves an active trail and ripple',t=>{
  const f=fixture(t);
  f.dispatch('pointerdown');f.update();f.render();
  const texture=f.field.texture;
  const composite=f.renderer.renders[2].scene.children[0].material.uniforms;
  const ripple=composite.uRipples.value.find(item=>item.w>0);
  const rippleAge=ripple.z;
  f.renderer.reset();f.field.resize(1280,720,.7,false);
  assert.equal(f.field.processing,true);
  assert.equal(f.field.texture,texture,'adaptive display resolution keeps the flow texture');
  assert.equal(ripple.z,rippleAge,'adaptive resolution does not reset the ripple');
  assert.ok(f.renderer.calls.every(call=>call.type!=='clear'),'adaptive resolution does not clear the live field');
  f.update();f.render();assertFullFrame(f);
});

test('warmup compiles all passes and restores the caller render target',async t=>{
  const f=fixture(t),priorTarget={name:'caller-target'};
  f.renderer.setRenderTarget(priorTarget);f.renderer.reset();
  await f.field.warmup(f.scene,f.camera);
  assert.equal(f.renderer.getRenderTarget(),priorTarget);
  assert.equal(f.renderer.calls.filter(call=>call.type==='compile').length,4);
  assert.equal(f.renderer.renders.length,0,'shader warmup submits no visible draw');
  assert.equal(f.field.processing,false,'warmup leaves the field idle');
});
