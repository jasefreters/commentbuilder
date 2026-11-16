const L = require('./lib')('ac9/13.json'); const { keep, add, ap } = L;
keep(14, 'F', 'AC9MFST01'); keep(15, 'F', 'AC9MFST01');
keep(16, 1, ['AC9M1ST01', 'AC9M1ST02']); add('{{S}} collects information using tally marks and objects and records it in a list.', 1, 'AC9M1ST01');
keep(17, 1, 'AC9M1ST02', 'picture graphs are Year 1 here, not Year 2');
keep(13, 2, 'AC9M2ST01'); keep(19, 2, 'AC9M2ST01', 'surveys are Year 2 here');
[0, 1, 6, 12].forEach(i => keep(i, 2, 'AC9M2ST02'));
ap(20, 21);
L.rest('Year 3 to 6 sentence; decided in batch 14 or 15');
L.save();
