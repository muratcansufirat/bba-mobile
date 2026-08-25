declare module "pdf-parse/lib/pdf-parse.js" {
  type PdfResult = { text: string; numpages: number; numrender: number };
  export default function pdfParse(buffer: Buffer): Promise<PdfResult>;
}
