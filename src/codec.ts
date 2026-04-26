export function encode(data: string): Buffer {
  const buf = Buffer.from(data);
  const key = [0x4A, 0x47, 0x53, 0x57]; // "JGSW"
  const header = Buffer.from('JIGSAW');
  const body = Buffer.alloc(buf.length);
  
  for (let i = 0; i < buf.length; i++) {
    body[i] = buf[i] ^ key[i % key.length];
  }
  
  return Buffer.concat([header, body]);
}

export function decode(buf: Buffer): string {
  const header = buf.subarray(0, 6).toString();
  if (header !== 'JIGSAW') throw new Error('Invalid Jigsaw file');
  
  const key = [0x4A, 0x47, 0x53, 0x57];
  const body = buf.subarray(6);
  const decoded = Buffer.alloc(body.length);
  
  for (let i = 0; i < body.length; i++) {
    decoded[i] = body[i] ^ key[i % key.length];
  }
  
  return decoded.toString('utf8');
}