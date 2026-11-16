const L = require('./lib')('ac9/17.json'); const { keep, add } = L;
keep(8, 3, 'AC9M3P01', 'chance starts in Year 3 here'); keep(7, 3, 'AC9M3P01', 'chance starts in Year 3 here');
[4, 5, 3, 9].forEach(i => keep(i, 3, 'AC9M3P02'));
keep(0, 4, 'AC9M4P01'); keep(10, 4, 'AC9M4P01', 'independent and dependent events are Year 4 here');
add('{{S}} repeats a chance experiment many times and describes how the results change each time.', 4, 'AC9M4P02');
add('{{S}} compares the results of a chance experiment with {{pos}} predictions and describes any differences.', 4, 'AC9M4P02');
L.rest('decided in batch 16 or 18');
L.save();
