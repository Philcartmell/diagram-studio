// Generates the stress specs in this folder: node run `node make-stress.mjs`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const w = (n, o) => fs.writeFileSync(path.join(dir, `${n}.json`), JSON.stringify(o, null, 2) + '\n');

// 1. Longest allowed labels at executive (40 chars) and descriptions (70 chars), at the node limit (9).
const labels = [
  'Customer onboarding and identity checks',
  'Pricing analytics and rate optimisation',
  'Claims triage and first notice of losses',
  'Supplier risk monitoring and escalations',
  'Group treasury cash and liquidity views',
  'Regulatory reporting and attestation hub',
  'Workforce planning and capacity modeling',
  'Contract lifecycle and obligations log',
  'Data quality controls and lineage review',
];
for (const l of labels) if (l.length > 40) throw new Error(`label too long (${l.length}): ${l}`);
const desc = 'Shared across divisions with one owner and one set of service levels';
w('01-executive-longest-labels', {
  version: '1.0',
  type: 'operating-model',
  altitude: 'executive',
  title: 'Nine shared capabilities carry the target model at executive level',
  subtitle: 'Stress: longest executive labels and descriptions at the node limit',
  body: {
    layers: [0, 1, 2].map((i) => ({
      id: `layer-${i + 1}`,
      label: `Capability layer ${i + 1}`,
      nodes: [0, 1, 2].map((j) => ({ id: `n-${i * 3 + j + 1}`, label: labels[i * 3 + j], description: desc })),
    })),
  },
});

// 2. Management altitude at its node limit (20).
w('02-management-max-nodes', {
  version: '1.0',
  type: 'layered-architecture',
  altitude: 'management',
  title: 'Twenty services across four layers sit inside a single management view',
  body: {
    layers: ['Channels', 'Services', 'Integration', 'Data'].map((l, i) => ({
      id: `layer-${i + 1}`,
      label: l,
      nodes: [0, 1, 2, 3, 4].map((j) => ({ id: `svc-${i * 5 + j + 1}`, label: `${l} service ${j + 1}`, description: 'Owned by one product team' })),
    })),
    crossCutting: [{ id: 'security', label: 'Security' }],
  },
});

// 3. Detailed altitude at its node limit (60), on a growing canvas.
w('03-detailed-60-nodes', {
  version: '1.0',
  type: 'operating-model',
  altitude: 'detailed',
  canvas: { aspect: 'auto' },
  title: 'Sixty processes map onto six capability layers in the detailed design',
  body: {
    layers: [0, 1, 2, 3, 4, 5].map((i) => ({
      id: `layer-${i + 1}`,
      label: `Layer ${i + 1}`,
      nodes: Array.from({ length: 10 }, (_, j) => ({ id: `p-${i * 10 + j + 1}`, label: `Process ${i * 10 + j + 1}` })),
    })),
  },
});

// 4–5. A single node, and a single swimlane step.
w('04-single-node', {
  version: '1.0',
  type: 'operating-model',
  altitude: 'executive',
  title: 'One shared service now handles every request from the business',
  body: { layers: [{ id: 'service', label: 'Shared service', nodes: [{ id: 'only', label: 'Global service desk', emphasis: 'accent' }] }] },
});
w('05-single-step-swimlane', {
  version: '1.0',
  type: 'swimlane',
  altitude: 'executive',
  title: 'A single automated step replaces the old four-team approval chain',
  body: {
    lanes: [{ id: 'system', label: 'Platform' }],
    steps: [{ id: 'auto', lane: 'system', label: 'Auto-approve', shape: 'system', emphasis: 'accent' }],
    edges: [],
  },
});

// 6. Non-Latin text: accents and CJK (CJK falls back to system fonts).
w('06-non-latin-text', {
  version: '1.0',
  type: 'value-chain',
  altitude: 'executive',
  title: 'Zürich, São Paulo and 東京 share one supply chain from 2027',
  subtitle: 'Déploiement mondial — façade commune, Öffnungszeiten vereinheitlicht',
  body: {
    primary: [
      { id: 'sourcing', label: 'Approvisionnement', items: ['Fournisseurs clés', 'Qualité contrôlée'] },
      { id: 'tokyo', label: '東京の物流センター', items: ['在庫管理', '出荷'], emphasis: 'accent' },
      { id: 'sales', label: 'Vendas e serviço', items: ['São Paulo', 'Zürich'] },
    ],
    outcome: { label: 'Größere Marge', description: '+2 pts' },
  },
});

// 7. A sixteen-step, five-lane process with a loop, on a growing canvas.
const steps = [
  ['ask', 'customer', 'Request', 'Request quote'],
  ['scope', 'sales', 'Request', 'Scope the need'],
  ['quote', 'sales', 'Request', 'Send quote'],
  ['accept', 'customer', 'Assess', 'Accept quote'],
  ['score', 'credit', 'Assess', 'Credit score'],
  ['limit', 'credit', 'Assess', 'Set limit'],
  ['ok', 'credit', 'Assess', 'Approved?'],
  ['draft', 'legal', 'Contract', 'Draft contract'],
  ['review', 'legal', 'Contract', 'Legal review'],
  ['sign', 'customer', 'Contract', 'Sign contract'],
  ['counter', 'sales', 'Contract', 'Countersign'],
  ['setup', 'operations', 'Deliver', 'Set up account'],
  ['ship', 'operations', 'Deliver', 'Ship order'],
  ['invoice', 'operations', 'Deliver', 'Invoice'],
  ['pay', 'customer', 'Deliver', 'Pay invoice'],
  ['close', 'sales', 'Deliver', 'Close deal'],
];
const edges = [
  ['ask', 'scope'], ['scope', 'quote'], ['quote', 'accept'], ['accept', 'score'], ['score', 'limit'], ['limit', 'ok'],
  ['ok', 'draft', 'yes'], ['ok', 'scope', 'no', 'feedback'], ['draft', 'review'], ['review', 'sign'], ['sign', 'counter'],
  ['counter', 'setup'], ['setup', 'ship'], ['ship', 'invoice'], ['invoice', 'pay'], ['pay', 'close'],
];
w('07-auto-canvas-swimlane', {
  version: '1.0',
  type: 'swimlane',
  altitude: 'management',
  canvas: { aspect: 'auto' },
  title: 'Sixteen steps across five teams fit when the canvas is allowed to grow',
  body: {
    lanes: ['Customer', 'Sales', 'Credit', 'Legal', 'Operations'].map((l) => ({ id: l.toLowerCase(), label: l })),
    phases: ['Request', 'Assess', 'Contract', 'Deliver'],
    steps: steps.map(([id, lane, phase, label]) => ({ id, lane, phase, label, ...(id === 'ok' ? { shape: 'decision' } : {}) })),
    edges: edges.map(([from, to, label, kind]) => ({ from, to, ...(label ? { label } : {}), ...(kind ? { kind, style: 'dashed' } : {}) })),
  },
});
// 8. Six lanes, horizontal, on a fixed 16:9 canvas, with a decision whose
// "yes" edge is listed first (the order once caused a crossing).
w('08-six-lanes-16x9', {
  version: '1.0',
  type: 'swimlane',
  altitude: 'executive',
  title: 'Orders with no contract in place wait about three weeks for a tender',
  subtitle: 'Purchase-order process, from request to supplier payment',
  callout: { text: 'Where a contract exists, Procurement skips the tender and orders straight away', anchor: 'tender' },
  body: {
    lanes: ['Requester', 'Line manager', 'Procurement', 'Supplier', 'Warehouse', 'Finance'].map((l) => ({ id: l.toLowerCase().replace(/ /g, '-'), label: l })),
    steps: [
      { id: 'raise-request', lane: 'requester', label: 'Raise PO request' },
      { id: 'approve-request', lane: 'line-manager', label: 'Approve request' },
      { id: 'contract-check', lane: 'procurement', label: 'Contract in place?', shape: 'decision' },
      { id: 'tender', lane: 'procurement', label: 'Run 3-quote tender', emphasis: 'accent', metric: 'about 3 weeks' },
      { id: 'place-order', lane: 'procurement', label: 'Place order' },
      { id: 'deliver', lane: 'supplier', label: 'Deliver goods' },
      { id: 'receipt', lane: 'warehouse', label: 'Receipt goods' },
      { id: 'pay', lane: 'finance', label: 'Pay supplier' },
    ],
    edges: [
      { from: 'raise-request', to: 'approve-request' },
      { from: 'approve-request', to: 'contract-check' },
      { from: 'contract-check', to: 'place-order', label: 'yes' },
      { from: 'contract-check', to: 'tender', label: 'no' },
      { from: 'tender', to: 'place-order' },
      { from: 'place-order', to: 'deliver' },
      { from: 'deliver', to: 'receipt' },
      { from: 'receipt', to: 'pay' },
    ],
  },
});
console.log('stress specs written');
