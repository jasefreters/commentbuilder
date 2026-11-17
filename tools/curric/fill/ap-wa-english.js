const L = require('./lib')('wa/ap-english.json'); const { keep, add } = L;
const ids = require('../source/wa/ap-english.json'); const I = (st, mode, strand) => ids.find(r => r.year === st && r.subStrand.toLowerCase().startsWith(mode) && r.strand === strand).id;
const k = (i, st, mode, strand) => keep(i, st, I(st, mode, strand));
k(0,'B','speaking','Literacy'); k(1,'B','speaking','Language'); k(2,'A','speaking','Literacy'); k(3,'C','speaking','Literacy'); k(4,'D','speaking','Language');
k(5,'C','speaking','Language'); k(6,'D','speaking','Literacy'); k(7,'D','writing','Literature'); k(8,'D','speaking','Language'); k(9,'C','reading','Literacy');
k(10,'D','speaking','Literature'); k(11,'D','reading','Literacy'); k(12,'D','speaking','Literacy'); k(13,'D','reading','Literature'); k(14,'D','reading','Literacy');
k(15,'A','writing','Literacy'); k(16,'C','writing','Literacy'); k(17,'B','writing','Literacy'); k(18,'C','writing','Literature'); k(19,'C','writing','Language');
k(20,'D','writing','Language'); k(21,'D','reading','Language'); k(22,'C','writing','Literacy'); k(23,'D','writing','Literacy');
const NEW = {};
module.exports = { L, I, NEW };
if (require.main === module) { require('./ap-wa-english-new.js')(L, I); L.save(); }
