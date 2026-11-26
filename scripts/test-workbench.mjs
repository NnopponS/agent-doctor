import assert from 'node:assert/strict';
class Element {
  values={}; children=[]; value=''; textContent=''; dataset={}; open=false; disabled=false;
  addEventListener(name,fn){this.values[name]=fn}
  toggleAttribute(){}
  setAttribute(){}
  append(...children){this.children.push(...children)}
  replaceChildren(){this.children=[]}
  focus(){}
}
const elements=new Map();
const lookup=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
globalThis.document={getElementById:lookup,createElement:()=>new Element(),createTextNode:text=>({text})};
lookup('severity').value='all';
await import('../docs/workbench.js');
assert.notEqual(lookup('score').textContent,'–');
assert.equal(lookup('download').disabled,false);
lookup('compare-example').values.click();
assert.equal(lookup('comparison').hidden,false);
assert.match(lookup('comparison').children[0].textContent,/fewer/);
lookup('severity').value='error';lookup('severity').values.change();
assert(lookup('findings').children.every(el=>el.dataset.level===undefined||el.dataset.level==='error'));
lookup('second').value='not json';lookup('audit').values.click();
assert.equal(lookup('download').disabled,true);
assert.equal(lookup('score').textContent,'–');
lookup('reset').values.click();
assert.equal(lookup('input').value,'');
console.log('Browser workbench interaction smoke test passed.');
