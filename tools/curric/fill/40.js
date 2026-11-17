const L = require('./lib')('ac9/40.json'); const { keep, add, drop } = L;
keep(0,6,'AC9E6LE04'); keep(1,5,'AC9E5LE05'); keep(2,6,'AC9E6LE05'); keep(3,6,'AC9E6LE02'); keep(5,6,'AC9E6LE01'); keep(6,5,'AC9E5LE04'); keep(8,5,'AC9E5LE04');
keep(10,5,'AC9E5LE02'); keep(11,5,'AC9E5LE03');
[17,18,19,20,21].forEach(i=>drop(i,'Year 7 or above'));
// Year 5
add('{{S}} identifies aspects of a text that show its historical, social and cultural context.',5,'AC9E5LE01');
add('{{S}} explains how a story reflects the time, place and culture in which it is set.',5,'AC9E5LE01');
add('{{S}} presents an opinion on a literary text using terms for literary devices and structure.',5,'AC9E5LE02');
add('{{S}} recognises that point of view shapes how readers respond to events and characters.',5,'AC9E5LE03');
add('{{S}} examines imagery such as similes, metaphors and personification, as well as sound devices in stories and poems.',5,'AC9E5LE04');
add('{{S}} creates and edits literary texts that experiment with figurative language, storylines and characters.',5,'AC9E5LE05');
// Year 6
add('{{S}} identifies how people respond to characters and events in texts from different times and places.',6,'AC9E6LE01');
add('{{S}} identifies similarities and differences between literary texts on similar themes.',6,'AC9E6LE02');
add('{{S}} identifies and explains the features that make up an author\'s individual style.',6,'AC9E6LE03');
add('{{S}} explains how an author uses a distinct voice and style to engage readers.',6,'AC9E6LE03');
add('{{S}} explains how authors use sound and imagery to create meaning and effect in poetry.',6,'AC9E6LE04');
add('{{S}} creates and edits literary texts that adapt the plot, characters, settings or ideas of other texts.',6,'AC9E6LE05');
L.rest('Year 4 or below sentence; decided in batch 38 or 39');
L.save();
