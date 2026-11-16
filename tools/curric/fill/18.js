const L = require('./lib')('ac9/18.json'); const { keep, add, drop } = L;
keep(6, 5, 'AC9M5P01', 'equally likely is Year 5 here'); add('{{S}} lists all the possible outcomes of an experiment and says whether they are equally likely.', 5, 'AC9M5P01');
keep(1, 5, 'AC9M5P02'); keep(2, 5, 'AC9M5P02'); keep(11, 5, 'AC9M5P02');
keep(10, 6, 'AC9M6P01'); add('{{S}} places events on a scale from zero to one and estimates their likelihood as fractions or percentages.', 6, 'AC9M6P01');
keep(9, 6, 'AC9M6P02'); add('{{S}} uses digital tools to run an experiment many times and explains how more trials affect the results.', 6, 'AC9M6P02');
drop(12, 'Year 7 or above');
L.rest('decided in batch 17');
L.save();
