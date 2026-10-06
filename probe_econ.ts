import { generateRoute } from './src/world/generator';
for (const seed of ['s', 'threshold', 'ash-vault-101', 'wax-bell-256']) {
  const r = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
  const claims = r.rooms.filter((x) => (x.sockets||[]).some((s) => s.meta?.claim));
  const nSocks = claims.reduce((a,x) => a + x.sockets.filter(s=>s.meta?.claim).length, 0);
  console.log(seed, '| cages:', claims.map((x) => `${x.index}:${x.templateId}`).join(', ') || 'none', '| socks:', nSocks);
  const first = claims[0];
  if (first) console.log('   sample:', first.sockets.filter(s=>s.meta?.claim).map(s=>`${s.meta.claimTag}/${s.meta.contains}/${s.meta.price}`).join(' + '));
}
