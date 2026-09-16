/* 语法自检辅助：定位括号失衡的行 */
import { readFileSync } from 'node:fs';

const lines = readFileSync(process.argv[2] || 'game.js', 'utf8').split(/\r?\n/);

function strip(l) {
  let out = '';
  let i = 0;
  let s = null;
  let inBlock = false;
  while (i < l.length) {
    const ch = l[i], nx = l[i + 1];
    if (inBlock) { if (ch === '*' && nx === '/') { inBlock = false; i += 2; continue; } i++; continue; }
    if (s) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === s) s = null;
      i++;
      continue;
    }
    if (ch === '/' && nx === '/') break;
    if (ch === '/' && nx === '*') { inBlock = true; i += 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { s = ch; i++; continue; }
    out += ch;
    i++;
  }
  return out;
}

let depth = 0, paren = 0;
for (let i = 0; i < lines.length; i++) {
  const clean = strip(lines[i]);
  for (const ch of clean) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '(') paren++;
    else if (ch === ')') paren--;
  }
  if (depth < 0) { console.log('花括号深度为负 @ 行 ' + (i + 1) + ': ' + lines[i].trim()); break; }
}
console.log('最终 { } 深度 = ' + depth + '（应为 0）');
// 可选：打印指定行区间内每行的累计深度变化
const a = Number(process.argv[3] || 0), b = Number(process.argv[4] || 0);
if (a && b) {
  let z2 = 0;
  for (let i = 0; i < Math.min(b, lines.length); i++) {
    const before = z2;
    const clean = strip(lines[i]);
    for (const ch of clean) { if (ch === '{') z2++; else if (ch === '}') z2--; }
    if (i + 1 >= a && z2 !== before) console.log('  行' + (i + 1) + ' ' + before + '->' + z2 + '  ' + lines[i].trim().slice(0, 72));
  }
}
// IIFE 使整体深度 +1；中途回到 0 说明此处少了一个 { 或多了一个 }
let z = 0;
for (let i = 0; i < lines.length - 3; i++) {
  const clean = strip(lines[i]);
  for (const ch of clean) { if (ch === '{') z++; else if (ch === '}') z--; }
  if (z === 0) console.log('深度回到 0 @ 行 ' + (i + 1) + ': ' + lines[i].trim().slice(0, 80));
}
// 逐行报告深度变化，帮助定位
let d = 0;
const jumps = [];
for (let i = 0; i < lines.length; i++) {
  const before = d;
  const clean = strip(lines[i]);
  for (const ch of clean) { if (ch === '{') d++; else if (ch === '}') d--; }
  if (Math.abs(d - before) >= 2) jumps.push((i + 1) + ': ' + before + '->' + d + '  ' + lines[i].trim().slice(0, 70));
}
console.log('深度跳变 ≥2 的行：');
jumps.slice(0, 20).forEach((j) => console.log('  ' + j));
