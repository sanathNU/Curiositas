// Free texts (RES/SHORT) and which texts each note cites (NOTES).
const RES = {
  ab:["Book","Arora–Barak, Computational Complexity: A Modern Approach","https://theory.cs.princeton.edu/complexity/"],
  bt:["Survey","Bogdanov–Trevisan, Average-Case Complexity","https://arxiv.org/abs/cs/0606037"],
  vad:["Book","Vadhan, Pseudorandomness","https://people.seas.harvard.edu/~salil/pseudorandomness/"],
  ps:["Notes","Pass–Shelat, A Course in Cryptography","https://www.cs.cornell.edu/courses/cs4830/2010fa/lecnotes.pdf"],
  gold:["Book","Goldreich, Foundations of Cryptography","https://www.wisdom.weizmann.ac.il/~oded/foc-book.html"],
  bs:["Book","Boneh–Shoup, A Graduate Course in Applied Cryptography","https://toc.cryptobook.us/"],
  joy:["Book","Rosulek, The Joy of Cryptography","https://joyofcryptography.com/"],
  bar:["Notes","Barak, An Intensive Introduction to Cryptography","https://intensecrypto.org/"],
  pei:["Survey","Peikert, A Decade of Lattice Cryptography","https://eprint.iacr.org/2015/939"],
  tha:["Book","Thaler, Proofs, Arguments, and Zero-Knowledge","https://people.cs.georgetown.edu/jthaler/ProofsArgsAndZK.html"],
  ekr:["Book","Evans–Kolesnikov–Rosulek, A Pragmatic Introduction to Secure Multi-Party Computation","https://securecomputation.org/"],
  cs7810:["Course","CS 7810 Foundations of Cryptography (Wichs)","https://www.khoury.northeastern.edu/home/wichs/class/crypto25/index.html"],
  l4:["Notes","Wichs, lecture notes on one-time computational security","https://www.khoury.northeastern.edu/home/wichs/class/crypto25/lecture4.pdf"],
  l7:["Notes","Wichs, lecture notes on CPA security","https://www.ccs.neu.edu/home/wichs/class/crypto-fall17/lecture7.pdf"]
};
const NOTES = {
  threshold:[],
  ggm:["bs"],
  kex:["bs", "joy"],
  privamp:["vad"],
  natural:["ab"],
  finegrained:[],
  oram:["ekr"],
  we:[],
  qrom:[],
  mpcith:[],
  polycommit:["tha"],
  rlwe:["pei"],
  pvsnp:["ab"], avgcase:["bt","ab"], metac:["ab"], owf:["ps","gold"], factoring:["bs"], dlog:["bs"], pairings:["bs"],
  lattices:["pei","bar"], lpn:["pei"], rom:["bs","joy"], otp:["joy","bs"], hashing:["vad"], ss:["joy"], mpcit:["ekr"],
  extract:["vad"], prg:["ps","vad","joy"], hardcore:["ps","vad"], prf:["ps","joy"], prp:["joy","bs"], ske:["l4","l7","joy"],
  mac:["joy","bs"], crhf:["joy","bs"], commit:["ps"], sigs:["bs","ps"], pke:["bs","bar"], tdf:["pei","bs"], cca:["bs"],
  ot:["ekr","joy"], ibe:["pei"], reduce:["ps"], simul:["gold"], uc:["gold"], rewind:["bs"], blackbox:["bar"], quantadv:["bar"],
  ip:["tha","ab"], zk:["ps","gold","bar"], sigma:["bs","tha"], nizk:["gold"], pcp:["ab","tha"], iop:["tha"], snark:["tha"],
  snarg:["tha"], folding:["tha"], mpc:["ekr","gold"], garbled:["ekr","joy"], fhe:["pei","bar"], fe:["bar"], io:["bar"],
  pir:["bar"], qcrypto:["bar"], derand:["vad","ab"], circuits:["ab"], expanders:["vad","ab"], algebra:["tha"],
  coding:["vad"], learning:["ab"], geometry:["pei"], quantcomp:["ab"], isogeny:["bs"]
};


const SHORT = {ab:"Arora–Barak",bt:"Bogdanov–Trevisan survey",vad:"Vadhan, Pseudorandomness",ps:"Pass–Shelat notes",gold:"Goldreich, Foundations",bs:"Boneh–Shoup",joy:"Rosulek, Joy of Cryptography",bar:"Barak notes",pei:"Peikert survey",tha:"Thaler, Proofs, Arguments, and ZK",ekr:"Evans–Kolesnikov–Rosulek",cs7810:"CS 7810 course page",l4:"Wichs, one-time security notes",l7:"Wichs, CPA security notes"};
