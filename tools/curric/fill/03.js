const L = require('./lib')('ac9/03.json'); const { keep, reword, drop, add } = L;
// Year 5
reword(0, '{{S}} works confidently with large numbers and understands decimals to the hundredths and thousandths.', 5, 'AC9M5N01', 'the Year 5 description only supports decimals beyond two places; the millions claim is held in unsure.json');
keep(2, 5, ['AC9M5N01', 'AC9M5N04']);
reword(5, '{{S}} compares and orders whole numbers and fractions accurately.', 5, 'AC9M5N03', 'rounding decimals is not in the Year 5 content descriptions');
keep(8, 5, 'AC9M5N08');
add('{{S}} breaks numbers into factors and recognises multiples of numbers such as 6 and 9.', 5, 'AC9M5N02');
add('{{S}} tests whether a number is divisible by another using simple rules and explains {{pos}} reasoning.', 5, 'AC9M5N02');
add('{{S}} compares and orders fractions with related denominators, including mixed numbers.', 5, 'AC9M5N03');
keep(52, [5, 6], ['AC9M5N04', 'AC9M6N07']); keep(53, 5, 'AC9M5N04'); keep(55, 5, 'AC9M5N04', 'tagged Year 5 here; the NSW bank puts it later');
keep(50, [5, 6], ['AC9M5N05', 'AC9M6N05']);
add('{{S}} adds and subtracts fractions with the same or related denominators and explains the steps.', 5, 'AC9M5N05');
keep(33, 5, ['AC9M5N06', 'AC9M5N07']);
add('{{S}} multiplies larger numbers by one- and two-digit numbers using an efficient strategy and checks the answer.', 5, 'AC9M5N06');
reword(34, '{{S}} solves division problems with remainders and decides how to use the remainder in the answer.', 5, 'AC9M5N07', 'fact recall is Algebra; the division part is kept');
keep(37, 5, 'AC9M5N07');
add('{{S}} estimates before calculating and explains whether the answer to a money problem is reasonable.', 5, 'AC9M5N08');
keep(18, 5, 'AC9M5N09'); keep(19, 5, 'AC9M5N09'); keep(21, 5, 'AC9M5N09'); keep(27, 5, 'AC9M5N09');
add('{{S}} writes and runs a short set of steps to find factors and multiples of a number.', 5, 'AC9M5N10');
add('{{S}} uses a digital tool to explore divisibility and describes the patterns that appear.', 5, 'AC9M5N10');
// Year 6
keep(20, 6, 'AC9M6N09');
reword(31, '{{S}} multiplies and divides decimals by multiples of ten accurately.', 6, 'AC9M6N06', 'order of operations is Algebra (AC9M6A02) and is left out');
keep(46, [5, 6], ['AC9M5N04', 'AC9M6N03']);
keep(49, 6, 'AC9M6N07');
reword(51, '{{S}} identifies prime and composite numbers and explains how {{s}} knows.', 6, 'AC9M6N02', 'prime numbers are Year 6, not Year 5');
add('{{S}} uses negative numbers in everyday situations such as temperature and money.', 6, 'AC9M6N01');
add('{{S}} locates positive and negative numbers on a number line and describes their order.', 6, 'AC9M6N01');
add('{{S}} describes square and composite numbers and uses them to solve problems.', 6, 'AC9M6N02');
add('{{S}} places common fractions on one number line and justifies the order {{s}} chooses.', 6, 'AC9M6N03');
add('{{S}} adds and subtracts decimals using place value and checks answers by estimating.', 6, 'AC9M6N04');
add('{{S}} uses digital tools to add and subtract decimals and checks that the answer is sensible.', 6, 'AC9M6N04');
add('{{S}} adds and subtracts fractions with different denominators by finding equivalent fractions.', 6, 'AC9M6N05');
add('{{S}} multiplies and divides decimals by ten, one hundred and one thousand without a calculator.', 6, 'AC9M6N06');
add('{{S}} approximates answers to problems with fractions, decimals and percentages before calculating.', 6, 'AC9M6N08');
add('{{S}} rounds numbers sensibly to judge whether an answer involving decimals or percentages is close.', 6, 'AC9M6N08');
add('{{S}} models practical problems with whole numbers, fractions and percentages and explains why {{s}} chose each step.', 6, 'AC9M6N09');
// Unsure: large numbers in the millions has no matching Year 3 to 6 description in the source summary
[1, 4, 6, 7, 9].forEach(i => drop(i, 'unsure; see unsure.json (large numbers in the millions)'));
// Year 7 and above
[3, 14, 15, 16, 17, 28, 29, 30, 32, 44, 45, 47, 48].forEach(i => drop(i, 'Year 7 or above; used for the Year 6 A grade once Year 7 is added'));
// Decided in batch 02 or Algebra
[10, 11, 12, 13, 22, 23, 24, 25, 26, 54, 56, 57, 58, 59, 60, 61, 62, 63, 64].forEach(i => drop(i, 'Year 3 or 4 sentence; decided in batch 02'));
[35, 36, 38, 39, 40, 41, 42, 43].forEach(i => drop(i, 'Number facts and patterns are Algebra; handled in the Algebra batch'));
L.save();
const fs = require('fs'), p = require('path').join(__dirname, '..', 'unsure.json');
const B = L.B; const u = [1, 4, 6, 7, 9].map(i => ({ batch: 'ac9/03', text: B.sentences[i].text, options: [{ year: 5, ref: 'AC9M5N01' }, { year: 3, ref: 'AC9M3N01' }], why: 'No Year 3 to 6 description in the source summary mentions numbers in the millions. Check the official text.' }));
fs.writeFileSync(p, JSON.stringify(u, null, 1));
