import fs from 'fs';
import { PDFParse } from 'pdf-parse';

async function test() {
  const buf = fs.readFileSync('test.pdf');
  const parser = new PDFParse();
  await parser.load(buf);
  const text = await parser.getText();
  console.log("TEXT:", text);
}
test().catch(console.error);
