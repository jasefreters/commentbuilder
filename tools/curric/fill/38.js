const L = require('./lib')('ac9/38.json'); const { keep, add, out } = L;
keep(0,2,'AC9E2LE03'); keep(4,2,'AC9E2LE05'); keep(8,2,'AC9E2LE02'); keep(9,1,'AC9E1LE03');
keep(10,'F','AC9EFLE02'); keep(11,'F','AC9EFLE03'); keep(12,'F','AC9EFLE01'); keep(13,'F','AC9EFLE04'); keep(14,1,'AC9E1LE04'); keep(15,'F','AC9EFLE05');
keep(16,2,'AC9E2LE01'); keep(17,2,'AC9E2LE04'); keep(18,2,'AC9E2LE05'); keep(19,1,'AC9E1LE02'); keep(20,2,'AC9E2LE03');
out(1,2,3,5,6,7,21,22);
// Foundation
add('{{S}} shares ideas about stories, poems and pictures and says how they link to {{pos}} own experiences.','F','AC9EFLE01');
add('{{S}} shares feelings and thoughts about the events and characters in a story.','F','AC9EFLE02');
add('{{S}} recognises the characters, events and endings in familiar stories.','F','AC9EFLE03');
add('{{S}} joins in rhymes, songs and poems and repeats their rhythm and sound patterns.','F','AC9EFLE04');
add('{{S}} retells a familiar story through play, drawing or performance.','F','AC9EFLE05');
// Year 1
add('{{S}} discusses how words and pictures show the characters, settings and events in a story.',1,'AC9E1LE01');
add('{{S}} describes a character or setting using ideas from the words and pictures.',1,'AC9E1LE01');
add('{{S}} shares {{pos}} response to a story by linking it to {{pos}} own life.',1,'AC9E1LE02');
add('{{S}} discusses the plot, characters and setting of a story.',1,'AC9E1LE03');
add('{{S}} listens to poems, chants and songs and makes up new lines using sound patterns.',1,'AC9E1LE04');
add('{{S}} retells a familiar story aloud using the plot, characters and some of the story words.',1,'AC9E1LE05');
add('{{S}} changes part of a familiar story and tells it in {{pos}} own way.',1,'AC9E1LE05');
// Year 2
add('{{S}} explains how the characters and settings in a story are connected.',2,'AC9E2LE01');
add('{{S}} identifies characters and settings in a story and gives reasons for {{pos}} response.',2,'AC9E2LE02');
add('{{S}} describes how the language of a text presents its characters and settings.',2,'AC9E2LE03');
add('{{S}} writes a poem or chant that copies the rhythm and sound patterns of ones {{s}} has read.',2,'AC9E2LE04');
add('{{S}} creates and edits a short story by adapting the structure and language of a familiar text.',2,'AC9E2LE05');
L.rest('Year 3 to 6 sentence; decided in batch 39 or 40');
L.save();
