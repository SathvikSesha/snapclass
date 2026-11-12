import fs from 'fs';

let c = fs.readFileSync('backend/src/services/facultyMaterials.service.js', 'utf8');
c = c.replace(/\r\n/g, '\n');

const target = `    if (
      error.name === 'NotFound' ||
      error.$metadata?.httpStatusCode === 404
    )`;

const replacement = `    if (
      error.name === 'NotFound' ||
      error.name === 'Forbidden' ||
      error.$metadata?.httpStatusCode === 404 ||
      error.$metadata?.httpStatusCode === 403
    )`;

c = c.replace(target, replacement);
fs.writeFileSync('backend/src/services/facultyMaterials.service.js', c, 'utf8');
console.log('Successfully patched facultyMaterials.service.js');
