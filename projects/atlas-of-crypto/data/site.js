// Page text for this atlas. title, description, tagline and mapLabel go into index.html at build time;
// about and begin are the atlas's own paragraphs in the About note (same markup as note text, \n\n
// between paragraphs); hideReading lists texts in reading.js kept out of "Further reading".
const SITE = {
title:"Atlas of Theoretical Cryptography",
description:"A map of theoretical cryptography: assumptions, primitives, proof systems and constructions as provinces, with a note for each and the results that connect them.",
tagline:"A map of theoretical cryptography and a place to wander in it",
mapLabel:"Map of theoretical cryptography: areas as countries, topics as provinces",
about:"The map shows cryptography as a continent. Each country is an area (assumptions, primitives, proof systems, constructions, and the neighbouring parts of theoretical computer science), and each province is a topic. Provinces that touch are related, and the faint lines between them are results: an arrow from one topic to another means the first is used to build, prove or understand the second.\n\nEvery topic has a note. A note opens with the topic’s defining identity when it has one, such as IP = PSPACE for [[ip]] or (<b>A</b>, <b>A</b><i>s</i> + <i>e</i>) ≈<sub>c</sub> (<b>A</b>, <i>u</i>) for [[lattices]], then explains the idea in a few paragraphs, with links to the Wikipedia article for each named concept and to other notes. It ends with where the topic leads, free texts and the papers that matter, and <i>Links to this note</i>: the topics that build into it.",
begin:"A natural route runs from [[avgcase]] through [[owf]] and [[prg]] to [[zk]]; another climbs from [[lattices]] through [[rlwe]] to [[fhe]], [[io]] and [[folding]]. Or pick a province that looks interesting and follow its links.",
hideReading:["cs7810","l4","l7"]
};
