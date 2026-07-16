import { PDFParse } from 'pdf-parse';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_TEXT_LENGTH = 15000; // Increased for better document summary
const MAX_URL_FETCH_LENGTH = 10000;

// Mime types we consider plain text
const TEXT_MIMES = [
  'text/plain', 'text/markdown', 'text/html', 'text/css', 
  'application/json', 'application/javascript', 'text/x-python',
  'text/csv', 'text/xml'
];

export async function processUrls(text) {
  if (!text) return '';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex) || [];
  if (urls.length === 0) return '';
  
  let extractedText = '';
  // Limit to first 2 URLs to avoid spamming
  const urlsToFetch = urls.slice(0, 2);
  
  for (const url of urlsToFetch) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/') && !contentType.includes('application/json')) continue;
      
      let fetchedText = await response.text();
      // Remove HTML tags roughly if it's HTML
      if (contentType.includes('text/html')) {
        fetchedText = fetchedText.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
      }
      
      if (fetchedText.length > MAX_URL_FETCH_LENGTH) {
        fetchedText = fetchedText.substring(0, MAX_URL_FETCH_LENGTH) + '\n...[TEXTO TRUNCADO]';
      }
      
      extractedText += `\n[Contenido del enlace '${url}']:\n"""\n${fetchedText}\n"""\n`;
    } catch (err) {
      console.error(`Error fetching URL ${url}:`, err);
    }
  }
  return extractedText;
}

export async function processAttachments(attachments) {
  if (!attachments || attachments.size === 0) return '';

  let extractedText = '';

  for (const [id, attachment] of attachments) {
    // Ignore files that are too large
    if (attachment.size > MAX_FILE_SIZE) {
      extractedText += `\n[Archivo ignorado: ${attachment.name} excede el límite de 5MB]\n`;
      continue;
    }

    const isPdf = attachment.contentType === 'application/pdf' || attachment.name.toLowerCase().endsWith('.pdf');
    const isText = TEXT_MIMES.includes(attachment.contentType) || isTextExtension(attachment.name);

    if (!isPdf && !isText) {
      // Ignorar imagenes u otros archivos binarios
      continue;
    }

    try {
      const response = await fetch(attachment.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${attachment.url}: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();

      if (isPdf) {
        try {
          const parser = new PDFParse({ data: buffer });
          const pdfData = await parser.getText();
          let text = pdfData.text.trim();
          if (text.length > MAX_TEXT_LENGTH) {
            text = text.substring(0, MAX_TEXT_LENGTH) + '\n...[TEXTO TRUNCADO POR LÍMITE DE SEGURIDAD]';
          }
          extractedText += `\n[Contenido del archivo PDF '${attachment.name}']:\n"""\n${text}\n"""\n`;
        } catch (err) {
          console.error(`Error parsing PDF ${attachment.name}:`, err);
          extractedText += `\n[Error al leer el archivo PDF '${attachment.name}']\n`;
        }
      } else if (isText) {
        const decoder = new TextDecoder('utf-8');
        let text = decoder.decode(buffer).trim();
        if (text.length > MAX_TEXT_LENGTH) {
          text = text.substring(0, MAX_TEXT_LENGTH) + '\n...[TEXTO TRUNCADO POR LÍMITE DE SEGURIDAD]';
        }
        extractedText += `\n[Contenido del archivo '${attachment.name}']:\n"""\n${text}\n"""\n`;
      }
    } catch (err) {
      console.error(`Error fetching attachment ${attachment.name}:`, err);
      extractedText += `\n[Error al descargar el archivo '${attachment.name}']\n`;
    }
  }

  return extractedText;
}

function isTextExtension(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const textExts = ['txt', 'md', 'js', 'py', 'json', 'html', 'css', 'csv', 'xml', 'log', 'env'];
  return textExts.includes(ext);
}

