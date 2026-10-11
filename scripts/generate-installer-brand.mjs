import fs from 'node:fs';
import sharp from 'sharp';
const mark = fs.readFileSync('public/syslume-mark.svg','utf8').match(/<g[\s\S]*<\/g>/)[0];
const header = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57"><rect width="150" height="57" fill="#f0f1e9"/><g transform="translate(5 6) scale(.07)">${mark}</g><text x="58" y="34" fill="#233529" font-family="Segoe UI" font-size="20" font-weight="600">Syslume</text></svg>`;
const sidebar = `<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314"><rect width="164" height="314" fill="#263c2b"/><path d="M0 262 70 220 164 268V314H0Z" fill="#344a35"/><g transform="translate(34 72) scale(.15)">${mark.replace('#31563a','#eaf0de')}</g><text x="82" y="202" text-anchor="middle" fill="#eaf0de" font-family="Segoe UI" font-size="23" font-weight="600">Syslume</text><text x="82" y="224" text-anchor="middle" fill="#b4ca97" font-family="Segoe UI" font-size="10">System intelligence</text></svg>`;
const msiBanner = `<svg xmlns="http://www.w3.org/2000/svg" width="493" height="58"><rect width="493" height="58" fill="#f0f1e9"/><g transform="translate(443 6) scale(.07)">${mark}</g></svg>`;
const msiDialog = `<svg xmlns="http://www.w3.org/2000/svg" width="493" height="312"><rect width="493" height="312" fill="#f0f1e9"/><rect width="164" height="312" fill="#263c2b"/><path d="M0 262 70 220 164 268V312H0Z" fill="#344a35"/><g transform="translate(34 72) scale(.15)">${mark.replace('#31563a','#eaf0de')}</g><text x="82" y="202" text-anchor="middle" fill="#eaf0de" font-family="Segoe UI" font-size="23" font-weight="600">Syslume</text><text x="82" y="224" text-anchor="middle" fill="#b4ca97" font-family="Segoe UI" font-size="10">System intelligence</text></svg>`;
for(const [name,svg] of [['header',header],['sidebar',sidebar],['msi-banner',msiBanner],['msi-dialog',msiDialog]]) {
  fs.writeFileSync(`docs/syslume/branding/installer-${name}.svg`,svg);
  await sharp(Buffer.from(svg)).png().toFile(`docs/syslume/branding/installer-${name}.png`);
  const {data,info}=await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const stride=Math.ceil(info.width*3/4)*4;
  const bitmap=Buffer.alloc(54+stride*info.height);
  bitmap.write('BM');bitmap.writeUInt32LE(bitmap.length,2);bitmap.writeUInt32LE(54,10);
  bitmap.writeUInt32LE(40,14);bitmap.writeInt32LE(info.width,18);bitmap.writeInt32LE(info.height,22);
  bitmap.writeUInt16LE(1,26);bitmap.writeUInt16LE(24,28);bitmap.writeUInt32LE(stride*info.height,34);
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
    const source=(y*info.width+x)*3, target=54+(info.height-y-1)*stride+x*3;
    bitmap[target]=data[source+2];bitmap[target+1]=data[source+1];bitmap[target+2]=data[source];
  }
  fs.writeFileSync(`src-tauri/icons/installer-${name}.bmp`,bitmap);
}
