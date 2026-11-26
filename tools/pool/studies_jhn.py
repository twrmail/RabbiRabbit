# Three studies built from the John 3:16-21 pool. Teacher text = stored pieces (byte-exact). 'say' = modern-language summary written by the AI stand-in (Claude, no model call),
# attributed by name, from that one piece only. Rabbit's own questions/headings are labeled as such on the page.
TEACH = {'matthew-henry':'Matthew Henry','john-calvin':'John Calvin','john-gill':'John Gill','jamieson-fausset-brown':'Jamieson, Fausset & Brown','augustine':'Augustine','chrysostom':'John Chrysostom','cyril':'Cyril of Alexandria'}
SAY = {
'JFB3.16.01':"Jamieson, Fausset and Brown ask which words of the gospel preachers and missionaries have spoken most often in every age, which have stirred millions of people, and which have brought so many to the feet of Christ. They point to these words about God's love, so simple and yet so majestic, as the ones that kindle self-giving love in cold and selfish hearts.",
'MHC3.16.05':"Matthew Henry invites us to be amazed that the great and holy God would love a worthless and wicked world with a love of good will, even though he could take no pleasure in what the world had become. He adds that some Jews wrongly thought the Messiah came only in love for their own nation, but Christ says he came in love for the whole world, Gentiles as well as Jews.",
'MHC3.16.06':"Matthew Henry says that even though many in the world perish, God giving his only Son was still love for the whole world, because through him a general offer of life and salvation goes out to all. He compares it to announcing a pardon to a rebellious province: it is love to invite everyone to come in, plead for it on their knees, and return to their loyalty.",
'GIL3.16.01':"John Gill says the world here does not mean every single person. The special love of God shown in giving his Son is not for everyone, he argues, because Christ is not given to every person: whoever receives the Son also receives all things freely with him, and that is not true of every man.",
'GIL3.16.15':"John Gill says God gave his only Son for the Gentiles as well as the Jews, to be their Savior and a sacrifice for them, and that this gift is proof of his love for them. He calls it a large, unspeakable and unchangeable gift, since it is God's own Son, one in essence and glory with him, given into the hands of men and even to death. Whoever believes, Jew or Gentile, will not perish but have everlasting life.",
'CHR3.16.1.01':"Chrysostom hears Jesus saying: do not be shocked that I must be lifted up so that you may be saved. This pleases the Father, who loved you enough to give his Son for slaves, and ungrateful ones at that. Chrysostom notes that a person would hardly do this even for a friend, or readily for a good person. He adds that Jesus speaks briefly here, yet every word carries weight.",
'CAL3.16.04':"John Calvin says John does not claim that God acted because he saw something in us worth saving. The credit for our rescue goes entirely to God's love. Because God gave his Son so that people would not perish, Calvin concludes that until Christ steps in to rescue the lost, everyone is headed for eternal destruction.",
'CAL3.16.08':"John Calvin says the word only-begotten is emphatic, meant to magnify the warmth of God's love for us. Since people are not easily convinced that God loves them, John states plainly that we are so dear to God that he did not spare even his only Son for our sake. Calvin concludes that anyone who is not satisfied with this proof and still doubts insults Christ, as if he were an ordinary man handed over to death at random.",
'CAL3.16.09':"John Calvin says we should rather consider that the more God values his only Son, the more precious our salvation was to him, since he chose that this Son should die to pay for it. Christ is the only Son by nature, and he shares that honor with us by adoption when we are joined to his body.",
'CAL3.16.10':"John Calvin calls it a remarkable tribute to faith that it frees us from everlasting destruction. Although we seem born to death, faith in Christ offers certain deliverance, so we need not fear the death that hangs over us. He says the word whosoever invites everyone to share in life and takes away every excuse from unbelievers.",
'CAL3.16.11':"John Calvin says that although nothing in the world deserves God's favor, God shows he is reconciled to the whole world by inviting all people without exception to faith in Christ, which is the way into life. He adds a reminder: life is promised to everyone who believes, but faith is not common to all.",
'JFB3.17-21.01':"Jamieson, Fausset and Brown call this a statement of great importance. Although many people end up condemned as a result of Christ's coming, condemning is not the aim of his mission. His mission is purely to save.",
'MHC3.17.01':"Matthew Henry says God's design in sending his Son was that the world might be saved through him. He came with salvation in view and in hand, so the offer of life and salvation is sincere and will be made good to everyone who accepts it by faith. God sent him into a guilty, rebellious world, not as a passing visitor like the angels sent before, but as one who lives here.",
'CAL3.17.02':"John Calvin says John repeats the word world so that no one who keeps to the road of faith will think himself shut out. Calvin reads judge here as condemn, and says this shows the real purpose of Christ's coming: there was no need for him to come to destroy people who were already ruined.",
'AUG3.17.1.01':"Augustine asks why Jesus is called the Savior of the world if not because he saves it. He compares Christ to a doctor who, as far as his own will goes, heals the sick. A patient who ignores the doctor's instructions, though, destroys himself.",
'CHR3.17-18.1.01':"Chrysostom says Christ has two comings with different purposes. The first came to forgive, not to examine our actions; the second will be to examine, not to forgive. So of the first Jesus says he came not to condemn the world but to save it, while at the second he will set the sheep on his right hand and the goats on his left.",
'GIL3.17.03':"John Gill reads the world that is saved as the world of the elect in general: those God decided to save and chose to receive salvation through Jesus Christ. Christ was appointed to be their salvation and came to seek and save them, especially his chosen people among the Gentiles. That is why he is called God's salvation to the ends of the earth, and everyone everywhere is called to look to him and be saved.",
'MHC3.18.01':"Matthew Henry draws out the happiness of believers. Although a person has been a great sinner and stands convicted, once he believes the process is stopped and judgment is held back. This is more than a delay: he is acquitted and discharged, and is not dealt with by the strict justice his sins deserve.",
'JFB3.18.01':"Jamieson, Fausset and Brown say the believer has passed from death to life the moment he believes. The one who is condemned already is the one who rejects the single way out that God gave his Son to provide, and so chooses to stay condemned.",
'GIL3.18.02':"John Gill says the believer, Jew or Gentile, faces no condemnation because he is in Christ. The sentence of death passed on all in Adam, but Christ, standing in for his people, suffered that death in their place, so his death shields them from all condemnation and from the curse of the law. Having passed from death to life, they will never enter into condemnation.",
'CAL3.18.02':"John Calvin says the words is not condemned mean that believers are safe from the fear of condemnation. For everyone who rejects the life given in Christ, nothing remains but death, since life consists in nothing else than faith.",
'CAL3.18.03':"John Calvin says the words condemned already stress that unbelievers are utterly ruined. He adds that Christ speaks especially of people whose wickedness shows itself in open contempt for the gospel.",
'MHC3.18.03':"Matthew Henry reads here the fate of those who will not believe in Christ: they are already condemned. Their sin is serious because of the one they dismiss, the only Son of God, who is completely true and good and deserves to be believed and embraced. God sent the one dearest to himself to save us, so shouldn't he be dearest to us?",
'CHR3.18.1.01':"Chrysostom stresses that the one not judged is the one who believes, not the one who is merely curious or nosy. He adds that people who claim to know God but deny him by their works are not true believers at all, and that Jesus means such a person is not judged in this one respect: for his works he will suffer a severer punishment, but having once believed, he is not punished for unbelief.",
'CAL3.19.02':"John Calvin says people think it harsh that those who do not believe in Christ are doomed. So that no one blames Christ for his own condemnation, John shows that each person should blame himself, since unbelief is a sign of a bad conscience. It is their own wickedness that keeps unbelievers from coming to Christ.",
'MHC3.19.04':"Matthew Henry says humanity's fall began in a desire for forbidden knowledge and is kept alive by a desire for forbidden ignorance. People love their sickness and their slavery and will not be made free or whole. The true reason they love darkness is that their deeds are evil: they think darkness excuses their deeds, and they hate the light because it takes away the good opinion they had of themselves by showing them their sin and misery.",
'JFB3.19.01':"Jamieson, Fausset and Brown say this is the condemnation in a strong sense: it reveals a condemnation that already exists and seals in it those who will not be delivered from it. The light has come into the world in the person of Jesus himself. They add that loving darkness can only be known by deliberately rejecting Christ, but that rejection reveals it in a frightening way.",
'CHR3.19.2.01':"Chrysostom points out that Jesus takes away every excuse when he says the light came into the world. Did they seek it themselves, he asks, or work to find it? The light itself came to them, and even so they would not hurry toward it.",
'MHC3.20.06':"Matthew Henry puts it simply: Christ is hated because sin is loved. People who do not come to the light show a secret hatred of it; if they did not resist saving knowledge, they would not sit so contentedly in ruinous ignorance.",
'CAL3.20.01':"John Calvin explains that the light is hateful to such people only because they are wicked and want to hide their sins. By rejecting the remedy, they deliberately feed the very ground of their condemnation. He warns that we are mistaken if we think those who rage against the gospel are moved by godly zeal; they actually avoid the light so that they can flatter themselves more freely in the dark.",
'GIL3.20.02':"John Gill says the person who does evil avoids the light for fear his deeds will be exposed, that he will be shamed and blamed, and that he will be told to give them up, which he does not want to do.",
'JFB3.20.01':"Jamieson, Fausset and Brown define reproved here as exposed by detection.",
'AUG3.20.1.01':"Augustine observes that people love truth when it shines on them and hate it when it corrects them. They do not want to be deceived but do want to practice deceiving, so they love truth when it reveals itself and hate it when it reveals them. He says the truth will repay them: those who were unwilling to be found out will be found out against their will.",
'JFB3.21.01':"Jamieson, Fausset and Brown describe the one who does truth as someone whose only aim in life is to be and do what can stand the light. He loves the light and comes to it so that everything about him, thoroughly tested, may be seen to be divinely wrought and divinely approved.",
'MHC3.21.02':"Matthew Henry describes the character of a good man: he does truth, acting sincerely in all he does. He may sometimes fall short of the good he wants to do, and he has his weaknesses, but he aims honestly and holds on to his integrity. And he is one who comes to the light.",
'CAL3.21.03':"John Calvin says Christ uses the word truth because we are easily fooled by the outward shine of good works and do not look at what is hidden inside. Upright people, free from hypocrisy, willingly come into the presence of God, who alone is the fit judge of our works. Works are called done in God when he approves them and they are good by his standard.",
'AUG3.21.1.01':"Augustine says the works of the one who comes to the light are done in God because that person knows his justification comes from no merit of his own but from the grace of God.",
'AUG3.19-21.1.02':"Augustine says good works begin with admitting our evil works; that is when we do the truth, without soothing or flattering ourselves. We come to the light because the very sin that bothers us would not bother us unless God shone on us and showed it to us. Even those who have sinned only in word or thought should do the truth by confessing, and come to the light by doing good works.",
}
SAY['AUG3.17-18.1.01'] = "Augustine says that, as far as it is up to the physician, Christ came to heal the sick, and a patient who will not follow the physician's orders destroys himself. Christ is called the Saviour of the world because he came to save the world, not to judge it; the one who refuses to be saved by him is judged by himself."
SAY['AUG3.19-21.2.05'] = "Augustine says we begin to do the truth when we stop soothing and flattering ourselves and stop calling ourselves righteous while we are not. Coming to the light means letting our works be shown for what they are. Even the displeasure we feel at our own sin is God's doing: it would not trouble us unless God shone into us and his truth showed it to us."
STUDIES = [
 dict(key='A', retired='Nov 26: replaced by D/E (same verses, short shape); A was drawer content arranged as a study', scope=(16,18), title='Sent to Save', focus='Did Jesus come to judge the world, or to rescue it?',
  take="This take follows the mission: God's love gives the Son (3:16), the Son's purpose is rescue, not condemnation (3:17), and the believer is not condemned (3:18).",
  sections=[
   dict(verse=16, q="How far does God's love go, and why does it surprise us?", ids=[('JFB3.16.01','overview'),('MHC3.16.05','meaning'),('CHR3.16.1.01','meaning'),('CAL3.16.04','doctrine')]),
   dict(verse=17, q="Did the Son come to judge or to save?", ids=[('MHC3.17.01','meaning'),('AUG3.17-18.1.01','meaning'),('CAL3.17.02','word'),('CHR3.17-18.1.01','doctrine')]),
   dict(verse=18, q="What happens to the person who believes?", ids=[('MHC3.18.01','doctrine'),('JFB3.18.01','word'),('CHR3.18.1.01','application')])],
  closing="Rabbit's question to carry: If the one with the power to judge came to save, what does that change for you today?"),
 dict(key='B-old', retired='Nov 26: rebuilt as short study B on 3:19-21 (the unit movement Light and darkness)', scope=(18,21), title='Light and Hiding', focus='Why do people run from the light, and what does it look like to come to it?',
  take="This take follows the heart: condemnation is not Christ's aim, yet people choose the dark (3:18-20), and the one who does truth walks toward the light (3:21).",
  sections=[
   dict(verse=18, q="Condemned already: what does that mean?", ids=[('CAL3.18.03','word'),('JFB3.18.01','word'),('MHC3.18.03','warning')]),
   dict(verse=19, q="Whose fault is the darkness?", ids=[('CAL3.19.02','tension'),('MHC3.19.04','warning'),('JFB3.19.01','meaning'),('CHR3.19.2.01','context')]),
   dict(verse=20, q="What does the light expose, and why does that feel threatening?", ids=[('MHC3.20.06','meaning'),('CAL3.20.01','meaning'),('GIL3.20.02','word'),('JFB3.20.01','word')]),
   dict(verse=21, q="What does coming to the light look like?", ids=[('JFB3.21.01','meaning'),('MHC3.21.02','doctrine'),('CAL3.21.03','word'),('AUG3.19-21.2.05','application')])],
  closing="Rabbit's question to carry: What is one thing you tend to keep in the dark, and what would it mean to bring it to the light?"),
 dict(key='C', shape='disagreement', scope=(16,18), title='Who Is the World?', focus="How wide is God's love, and how do the teachers read 'the world' and 'whoever believes'?",
  take="This take lets the teachers disagree in the open: Henry and Calvin read the offer as going out to all; Gill reads 'the world' as the elect among every nation. Augustine and Calvin keep the human side in view.",
  sections=[
   dict(verse=16, q="Who is 'the world' in 3:16?", ids=[('MHC3.16.06','doctrine'),('GIL3.16.01','tension'),('CAL3.16.08','meaning'),('CAL3.16.09','doctrine'),('CAL3.16.10','doctrine'),('CAL3.16.11','doctrine')]),
   dict(verse=17, q="Saved: everyone, or those who believe?", ids=[('GIL3.17.03','tension'),('AUG3.17-18.1.01','meaning')]),
   dict(verse=18, q="Who is safe, and who is not?", ids=[('GIL3.18.02','doctrine'),('CAL3.18.02','word')])],
  closing="Rabbit's question to carry: Whatever you decide about the width of God's love, what does the invitation to whoever believes ask of you?"),
]

# Study D: the shorter shape suggested by an outside review (GPT, Nov 26), kept to our rules: whole pieces, each under a verse its note
# covers, at least two per verse, every AI line labeled. New: a short heading per teacher passage ('HEAD', written by the AI stand-in from
# that one passage, checked like a summary), one study question and one closing reflection instead of a question at every verse.
HEAD = {
'MHC3.16.05': "Wonder that a holy God loves a wicked world",
'CHR3.16.1.01': "A Son given for ungrateful slaves",
'AUG3.17-18.1.01': "The physician came to heal the sick",
'CAL3.17.02': "No one shut out who keeps the road of faith",
'MHC3.18.01': "More than a reprieve: the believer is acquitted",
'JFB3.18.01': "Passed from death to life",
}
STUDIES.append(dict(key='D', shape='short', scope=(16,18), title='The Love That Gives',
  focus="What does God's gift of his Son tell us about the heart of God?",
  take="This take is the short shape: six passages, two for each verse. The passages chosen here converge on the main line: God gives the Son to rescue (3:16), Christ comes to save rather than condemn (3:17), and the one who believes is not condemned (3:18).",
  sections=[
   dict(verse=16, q=None, ids=[('MHC3.16.05','meaning'),('CHR3.16.1.01','doctrine')]),
   dict(verse=17, q=None, ids=[('AUG3.17-18.1.01','meaning'),('CAL3.17.02','word')]),
   dict(verse=18, q=None, ids=[('MHC3.18.01','doctrine'),('JFB3.18.01','word')])],
  question="Christ came to heal, not to condemn. What does believing in him look like for you this week?",
  closing="Rabbit's closing reflection: The passages in this study point the same way: the Son was given to rescue, and the one who believes is not condemned. The gift is already offered; believing is how it is received."))

# Nov 26 (Tom: yes to all): study shapes, summary length cap, B rebuilt short, E added.
# Every summary is at most half its passage's length (floor 150 characters), checked by build_studies_jhn.py.
SAY.update({
'MHC3.16.05': "Matthew Henry marvels that the holy God would love so wicked a world with good will. Against the idea that the Messiah came only for one nation, he says Christ came in love to the whole world, Gentiles as well as Jews.",
'CHR3.16.1.01': "Chrysostom hears Jesus saying: do not be shocked that I must be lifted up to save you. The Father loved you enough to give his Son for slaves, ungrateful ones, something a person would hardly do even for a friend.",
'AUG3.17-18.1.01': "Augustine pictures Christ as a physician who came to heal the sick. He came to save the world, not to judge it; whoever refuses the physician's orders destroys himself and is judged by himself.",
'CAL3.17.02': "John Calvin says the word world is repeated so that no one on the road of faith feels shut out. Christ came not to condemn, since we were already ruined.",
'MHC3.18.01': "Matthew Henry says a believer, though a great sinner who stands convicted, is not condemned. This is more than a delay: judgment is stopped, and he is acquitted and discharged.",
'JFB3.18.01': "Jamieson, Fausset and Brown say the believer passes at once from death to life, while the unbeliever stays condemned by refusing God's one way out.",
'MHC3.16.06': "Matthew Henry says that though many perish, giving the Son was love to the whole world, since life is offered to all, like a pardon proclaimed to a rebel province.",
'GIL3.16.01': "John Gill says world here does not mean every person. God's special love shown in giving his Son is not for all, since whoever receives the Son receives all things with him, which is not true of everyone.",
'CAL3.16.08': "John Calvin says only-begotten is emphatic: because people find it hard to believe God loves them, God shows it by not sparing his own Son. To keep doubting after this, he says, insults Christ.",
'CAL3.16.09': "Calvin adds that the more God values his only Son, the more precious our salvation was to him, since the Son died to ransom us. Christ is Son by nature and shares that honor with us by adoption.",
'CAL3.16.10': "Calvin calls this high praise of faith: it frees us from everlasting destruction. The word whosoever invites everyone to life and leaves unbelievers without excuse.",
'CAL3.16.11': "Calvin says nothing in the world deserves God's favor, yet he shows himself reconciled to the whole world by inviting all to faith. Life is promised to all who believe, but faith is not common to all.",
'GIL3.17.03': "Gill reads the world that is saved as the elect whom God chose to save, including his chosen people among the Gentiles, which is why all the ends of the earth are called to look to him.",
'GIL3.18.02': "Gill says the believer, Jew or Gentile, is in Christ and free from condemnation. The sentence of death on all in Adam was carried out on Christ in his people's place, so whoever believes has passed from death to life and will never be condemned.",
'CAL3.18.02': "Calvin says is not condemned means believers are safe from the fear of condemnation. The unbeliever is condemned already because there is no other remedy: life lies only in faith, so rejecting it leaves only death.",
'CAL3.19.02': "John Calvin says no one should blame Christ for his condemnation. Unbelief shows a bad conscience: people's own wickedness keeps them from coming to Christ.",
'MHC3.19.04': "Matthew Henry says people love darkness because their deeds are evil. They are in love with their sickness and slavery, and hate the light because it robs them of their good opinion of themselves.",
'GIL3.20.02': "John Gill says the one who does evil avoids the light so his deeds are not exposed, shamed and blamed, and so that he is not told to give them up.",
'MHC3.20.06': "Matthew Henry says Christ is hated because sin is loved; staying away from the light shows a hidden hatred of saving knowledge.",
'JFB3.21.01': "Jamieson, Fausset and Brown say the one who does truth wants only what can bear the light, so he comes to it and is shown to be God's work.",
'AUG3.19-21.2.05': "Augustine says doing the truth begins when we stop flattering ourselves and calling ourselves righteous. Even our displeasure at our sin comes from God shining his truth into us.",
})
HEAD.update({
'CAL3.19.02': "Do not blame Christ for the darkness",
'MHC3.19.04': "In love with the sickness",
'GIL3.20.02': "Afraid of being exposed",
'MHC3.20.06': "Christ hated because sin is loved",
'JFB3.21.01': "A life that can bear the light",
'AUG3.19-21.2.05': "Doing the truth starts with honesty",
})
STUDIES.append(dict(key='B', shape='short', scope=(19,21), title='Light and Hiding',
  focus='Why do people run from the light, and what does it look like to come to it?',
  take="This take follows the heart. The passages chosen here trace why people choose the dark (3:19), what they fear in the light (3:20), and what coming to it looks like (3:21).",
  sections=[
   dict(verse=19, q=None, ids=[('CAL3.19.02','meaning'),('MHC3.19.04','warning')]),
   dict(verse=20, q=None, ids=[('GIL3.20.02','word'),('MHC3.20.06','meaning')]),
   dict(verse=21, q=None, ids=[('JFB3.21.01','meaning'),('AUG3.19-21.2.05','application')])],
  question="What is one thing you tend to keep in the dark, and what would it mean to bring it to the light?",
  closing="Rabbit's closing reflection: In these passages, coming to the light does not start with being clean. It starts with no longer hiding."))
STUDIES.append(dict(key='E', shape='short', scope=(16,18), title='The Love That Gives (four passages)',
  focus="What does God's gift of his Son tell us about the heart of God?",
  take="This take is the shortest shape: four passages, with Augustine's note covering both 3:17 and 3:18. The passages chosen here converge on the main line: God gives the Son to rescue (3:16), Christ comes to heal rather than condemn (3:17), and the one who believes is not condemned (3:18).",
  sections=[
   dict(verse=16, q=None, ids=[('MHC3.16.05','meaning'),('CHR3.16.1.01','doctrine')]),
   dict(verse=17, q=None, ids=[('AUG3.17-18.1.01','meaning')]),
   dict(verse=18, q=None, ids=[('MHC3.18.01','doctrine')])],
  question="Christ came to heal, not to condemn. What does believing in him look like for you this week?",
  closing="Rabbit's closing reflection: The passages in this study point the same way: the Son was given to rescue, and the one who believes is not condemned. The gift is already offered; believing is how it is received."))
STUDIES[:] = sorted(STUDIES, key=lambda st: st['key'])
