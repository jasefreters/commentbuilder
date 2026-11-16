const L = require('./lib')('ac9/01.json'); const { keep, drop, add, out, ap } = L;
// Foundation
keep(7, 'F', 'AC9MFN01'); add('{{S}} says number names in order to 20 and matches each name to a numeral.', 'F', 'AC9MFN01');
keep(8, 'F', 'AC9MFN02'); add('{{S}} recognises small groups of up to five objects without counting them one by one.', 'F', 'AC9MFN02');
keep(6, 'F', 'AC9MFN03'); add('{{S}} counts collections of up to 20 objects and says which group has more.', 'F', 'AC9MFN03');
keep(23, 'F', 'AC9MFN04'); keep(24, 'F', 'AC9MFN04');
keep(22, 'F', 'AC9MFN05'); add('{{S}} acts out simple story problems by joining and separating groups of objects.', 'F', 'AC9MFN05');
keep(42, 'F', 'AC9MFN06'); add('{{S}} shares objects equally between friends and explains how {{s}} knows each has the same.', 'F', 'AC9MFN06');
// Year 1
keep(0, 1, ['AC9M1N01', 'AC9M1N02']); keep(5, 1, 'AC9M1N02');
keep(9, 1, 'AC9M1N01'); keep(10, 1, 'AC9M1N01'); keep(11, 1, 'AC9M1N01');
keep(43, 1, 'AC9M1N03'); add('{{S}} counts groups of objects by twos, fives and tens to find the total.', 1, 'AC9M1N03');
keep(25, 1, 'AC9M1N04'); keep(26, 1, 'AC9M1N04');
add('{{S}} solves story problems that involve adding or taking away and uses coins to pay for small items.', 1, 'AC9M1N05');
add('{{S}} explains how {{s}} found the answer to an addition story problem using objects or drawings.', 1, 'AC9M1N05');
add('{{S}} shares a collection into equal groups to solve practical problems and explains {{pos}} thinking.', 1, 'AC9M1N06');
add('{{S}} makes equal groups of objects and says how many are in each group.', 1, 'AC9M1N06');
// Year 2
keep(1, 2, 'AC9M2N01'); keep(12, 2, 'AC9M2N01'); keep(14, 2, 'AC9M2N01');
keep(2, 2, 'AC9M2N02'); keep(13, 2, 'AC9M2N02');
keep(63, 2, 'AC9M2N03'); keep(64, 2, 'AC9M2N03'); keep(65, 2, 'AC9M2N03'); keep(66, 2, 'AC9M2N03');
keep(27, 2, 'AC9M2N04', 'two-digit numbers belong to Year 2, not Year 1 (Year 1 stays within 20)');
add('{{S}} adds and subtracts one- and two-digit numbers and writes a number sentence to match the problem.', 2, 'AC9M2N04');
keep(38, 2, 'AC9M2N05'); keep(39, 2, 'AC9M2N05'); keep(40, 2, 'AC9M2N05'); keep(45, 2, 'AC9M2N05');
add('{{S}} chooses addition, subtraction, equal groups or sharing to solve practical problems and checks that the answer makes sense.', 2, 'AC9M2N06');
add('{{S}} solves money problems by adding amounts and working out change from small purchases.', 2, 'AC9M2N06');
// Not Number, or out of span
drop(28, 'Equals sign and equivalence is Algebra; handled in the Algebra batch');
drop(29, 'Fact recall is Algebra (AC9M2A02); handled in the Algebra batch');
drop(41, 'Pattern work is Algebra (AC9MFA01); handled in the Algebra batch');
drop(44, 'Skip-counting patterns are Algebra (AC9M1A01); handled in the Algebra batch');
ap(17, 18, 19, 33, 34, 51, 52, 53);
out(3, 4, 15, 16, 20, 21, 30, 31, 32, 35, 36, 37, 46, 47, 48, 49, 50, 54, 55, 56, 57, 58, 59, 60, 61, 62, 67);
L.save();
