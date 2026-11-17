const L = require('./lib')('wa/ap-maths.json'); const { keep, add, drop } = L;
const ids = require('../source/wa/ap-maths.json'); const I = (st, sub) => ids.find(r => r.year === st && r.subStrand.toLowerCase().startsWith(sub)).id;
const k = (i, st, sub) => keep(i, st, I(st, sub));
k(0,'D','number'); k(1,'C','number'); k(2,'B','number'); k(3,'D','number'); k(4,'D','number'); k(5,'D','patterns'); k(6,'C','number'); k(7,'B','number');
k(8,'D','location'); k(9,'C','units'); k(10,'C','shape'); k(11,'D','units'); k(12,'A','shape'); k(13,'B','shape');
drop(14,'Unsure: stacking objects has no matching description in the source summary. Check the official text.');
k(15,'D','units'); k(16,'C','units'); k(17,'C','units');
drop(18,'Unsure: reading the hands of an analog clock is beyond the Stage A to D content in the source summary. Check the official text.');
k(19,'D','data'); k(20,'B','data');
module.exports = { L, I };
if (require.main === module) { require('./ap-wa-maths-new.js')(L, I); L.save(); }
