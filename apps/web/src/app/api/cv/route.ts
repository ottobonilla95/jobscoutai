import {localizedJson} from '@/lib/language';
import { guard, limitedBody } from '@/lib/auth';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const denied = await guard(request); if (denied) return denied;
  try {
    const bytes = await limitedBody(request, 6 * 1024 * 1024);
    const form = await new Response(bytes.buffer as ArrayBuffer, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData();
    const file = form.get('cv');
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024) return localizedJson({ error: 'Choose a PDF, DOCX, or TXT file under 5 MB.' }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer()); let text = '';
    if (/\.pdf$/i.test(file.name)) {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
    } else if (/\.docx$/i.test(file.name)) {
      const mammoth = await import('mammoth');
      text = (await mammoth.extractRawText({ buffer })).value;
    } else if (/\.txt$/i.test(file.name)) { text = buffer.toString('utf8'); }
    else return localizedJson({ error: 'Supported formats: PDF, DOCX, TXT.' }, { status: 400 });
    text = text.trim();
    if (text.length < 100) return localizedJson({ error: 'Very little text could be extracted. Paste your CV text instead; scanned PDFs need OCR first.' }, { status: 400 });
    return localizedJson({ text: text.slice(0,30000), name: file.name.slice(0,200), truncated: text.length > 30000 });
  } catch { return localizedJson({ error: 'Could not read that file. Try a text-based PDF or paste your CV below.' }, { status: 400 }); }
}
