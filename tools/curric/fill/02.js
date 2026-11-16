const L = require('./lib')('ac9/02.json'); const { keep, reword, drop, add } = L;
// Year 3
reword(13, '{{S}} is learning to read and represent numbers in different ways and can order numbers up to five digits.', 3, 'AC9M3N01', 'four digits sits below Year 3, which goes beyond 10 000');
keep(21, 3, 'AC9M3N01');
reword(22, '{{S}} arranges numbers of up to five digits from lowest to highest.', 3, 'AC9M3N01', 'six digits is above Year 4 in this curriculum');
keep(64, 3, 'AC9M3N02'); keep(68, 3, 'AC9M3N02'); keep(71, [3, 4], ['AC9M3N02', 'AC9M4N04']);
reword(27, '{{S}} uses known number facts and place value strategies to solve addition and subtraction problems.', 3, 'AC9M3N03', 'fact recall itself is Algebra; this keeps the place value strategy');
keep(28, 3, 'AC9M3N03', 'three-digit subtraction is Year 3 here, not Year 4'); keep(34, 3, 'AC9M3N03'); keep(35, 3, 'AC9M3N03');
add('{{S}} multiplies and divides one- and two-digit numbers using arrays and diagrams to show {{pos}} thinking.', 3, 'AC9M3N04');
add('{{S}} writes number sentences to match multiplication and division problems and solves them using equal groups.', 3, 'AC9M3N04');
add('{{S}} estimates how many items are in a collection and checks the estimate by counting.', 3, 'AC9M3N05');
add('{{S}} uses an estimate to decide whether the answer to an addition or subtraction problem is sensible.', 3, 'AC9M3N05');
add('{{S}} solves everyday problems that involve adding, subtracting, multiplying or dividing and explains what the answer means.', 3, 'AC9M3N06');
add('{{S}} works out the total cost and change for purchases and shows the calculation clearly.', 3, 'AC9M3N06');
add('{{S}} follows and writes step-by-step instructions that explore number patterns and describes what {{s}} notices.', 3, 'AC9M3N07');
add('{{S}} creates a short set of steps with a decision to sort or build numbers and tests whether it works.', 3, 'AC9M3N07');
// Year 4
keep(62, 4, ['AC9M4N01', 'AC9M4N03']); keep(70, 4, 'AC9M4N01');
add('{{S}} explains why a number is odd or even by looking at its last digit.', 4, 'AC9M4N02');
add('{{S}} uses what {{s}} knows about odd and even numbers to predict the results of adding them.', 4, 'AC9M4N02');
keep(65, 4, 'AC9M4N03'); keep(67, 4, 'AC9M4N03'); keep(76, 4, 'AC9M4N03');
L.reword(66, '{{S}} recognises simple fractions such as halves and quarters and records them as decimals.', 4, 'AC9M4N03', 'records numbers as decimals is Year 4; fraction names alone are Year 2');
keep(69, 4, 'AC9M4N04');
add('{{S}} multiplies and divides whole numbers by ten and one hundred using place value.', 4, 'AC9M4N05');
add('{{S}} solves problems that involve multiplying or dividing by multiples of ten and explains the method used.', 4, 'AC9M4N05');
add('{{S}} chooses efficient mental and written strategies for all four operations and uses digital tools to check answers.', 4, 'AC9M4N06');
add('{{S}} uses place value to add and subtract numbers up to four digits and works out the answers efficiently.', 4, 'AC9M4N06');
keep(12, 4, 'AC9M4N07', 'records numbers in different ways is covered by the Year 4 place value descriptions'); keep(36, 4, 'AC9M4N07');
add('{{S}} writes number sentences to solve problems about money and explains the steps in {{pos}} solution.', 4, 'AC9M4N08');
add('{{S}} solves purchase problems that need adding, subtracting, multiplying or dividing and checks that the answer is sensible.', 4, 'AC9M4N08');
add('{{S}} follows and creates steps that add or multiply to build a set of numbers and describes the pattern.', 4, 'AC9M4N09');
add('{{S}} tests a step-by-step number rule on different starting numbers and explains what happens.', 4, 'AC9M4N09');
// Algebra, decided elsewhere, out of span
[41, 42, 44, 51, 53, 54, 55].forEach(i => drop(i, 'Number facts and patterns are Algebra (AC9M2A03 to AC9M4A02); handled in the Algebra batch'));
drop(52, 'Multiplication and division as opposites is AC9M5A01 (Year 5 Algebra); handled in the Algebra batch');
[8, 10, 11, 14, 15, 16, 17, 18, 19, 20, 29, 30, 31, 32, 33, 45, 46, 47, 48, 49, 50, 72, 73, 74, 75].forEach(i => drop(i, 'Year 1 or 2 sentence; decided in batch 01'));
[0, 1, 2, 3, 4, 5, 6, 7, 9, 23, 24, 25, 26, 37, 38, 39, 40, 43, 56, 57, 58, 59, 60, 61, 63].forEach(i => drop(i, 'out of span (Year 5 or above); handled in batch 03'));
L.save();
