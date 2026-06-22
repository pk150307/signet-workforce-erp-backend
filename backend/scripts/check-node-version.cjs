const MIN_NODE = 20;
const major = parseInt(process.version.slice(1).split('.')[0] ?? '0', 10);

if (major < MIN_NODE) {
  console.error(`\n❌ Node.js ${MIN_NODE}+ required (current: ${process.version}).`);
  console.error('   This project uses tsx, which does not run on older Node versions.');
  console.error('   From the repo root or backend folder, run:\n');
  console.error('     nvm use');
  console.error('     npm run dev\n');
  process.exit(1);
}
