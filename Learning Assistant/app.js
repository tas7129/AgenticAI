(() => {
  const STORE_KEY = 'studywise-state-v3';
  let state = loadState();
  let selectedTopic = firstUnlocked();
  let quiz = null;
  let flashIndex = 0;
  let flashBack = false;
  let toastTimeout;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && Array.isArray(saved.courses)) return saved;
      const old = JSON.parse(localStorage.getItem('studywise-state-v1'));
      if (old?.courses) return old;
      if (old?.topics) return { courses:[{id:'course-migrated',title:old.book||'My study material',topics:old.topics}],currentCourseId:'course-migrated',minutes:old.minutes||0,streak:old.streak||1,lastDay:old.lastDay||new Date().toDateString() };
    } catch {}
    return { courses:[], currentCourseId:null, minutes:0, streak:1, lastDay:new Date().toDateString() };
  }
  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  function course() { return state.courses.find(c=>c.id===state.currentCourseId) || state.courses[0] || {id:null,title:'Your study path',topics:[]}; }
  function topics() { return course().topics; }
  function firstUnlocked() { const i=topics().findIndex((t,n)=>unlocked(n)&&!mastered(t));return i<0?Math.max(0,topics().length-1):i; }
  function mastered(t) { return (t.passes||0)>=2; }
  function unlockPercent(t) { return Math.min(100,(t.passes||0)*50); }
  function unlocked(i) { return i===0 || ((topics()[i-1]?.passes||0)>=2); }
  function safe(s='') { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function markdown(s='') {
    return String(s).split('\n').map(line=>{
      let x=safe(line).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
      if(/^### /.test(x))return `<h4>${x.slice(4)}</h4>`;
      if(/^## /.test(x))return `<h3>${x.slice(3)}</h3>`;
      if(/^# /.test(x))return `<h2>${x.slice(2)}</h2>`;
      if(/^[-*] /.test(x))return `<li>${x.slice(2)}</li>`;
      if(/^\d+\. /.test(x))return `<li>${x.replace(/^\d+\. /,'')}</li>`;
      return x.trim()?`<p>${x}</p>`:'';
    }).join('').replace(/(?:<li>.*?<\/li>)+/gs,m=>`<ul>${m}</ul>`);
  }
  function toast(message) { const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),2400); }
  function sourceSentences(t) {
    return String(t.notes||'').replace(/\[(?:Page \d+|Section: [^\]]+)\]/g,'').split(/(?<=[.!?])\s+|\n+/).map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s.length>30);
  }
  function relevantSentences(t,query,limit=6) {
    const sentences=sourceSentences(t),words=String(query||'').toLowerCase().match(/[a-z0-9]{4,}/g)||[];
    if(!words.length)return sentences.slice(0,limit);
    return sentences.map((text,index)=>({text,index,score:words.reduce((n,w)=>n+(text.toLowerCase().includes(w)?1:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit).map(x=>x.text);
  }
  function makeLocalLesson(t) {
    const sentences=sourceSentences(t),intro=sentences.slice(0,2),key=sentences.slice(0,Math.min(8,sentences.length));
    const definitions=sentences.filter(s=>/:|\bis defined as\b|\brefers to\b|\bmeans\b/i.test(s)).slice(0,5);
    const process=sentences.filter(s=>/\b(first|then|next|after|before|finally|therefore|because|leads to|results in|causes|when|if)\b/i.test(s)).slice(0,5);
    let out=`## ${t.title}\n\n### Big picture\n${intro.length?intro.map(s=>`${s}`).join('\n\n'):`Your source labels this topic **${t.title}**. Add fuller notes to build a more detailed lesson.`}`;
    if(definitions.length)out+=`\n\n### Key terms and ideas\n${definitions.map(s=>`- ${s}`).join('\n')}`;
    out+=`\n\n### Walk through the material\n${(process.length?process:key.slice(2,8)).map((s,i)=>`${i+1}. ${s}`).join('\n')||'The source contains too little readable text for a fuller explanation.'}`;
    out+=`\n\n### Quick recap\n${key.slice(0,4).map(s=>`- ${s}`).join('\n')||`- Review the source notes for ${t.title}.`}`;
    out+='\n\n*Built locally from your source text. This tool reorganizes and simplifies the extracted material; it does not add outside facts.*';
    return out;
  }
  function makeLocalQuiz(t) {
    const pool=sourceSentences(t).filter(s=>s.length<260).slice(0,30);
    if(pool.length<4)throw new Error('There is not enough readable text for a reliable quiz. Add more notes or upload a text-based PDF with at least four clear statements.');
    const questions=[];
    for(let n=0;n<8;n++){
      const correctIndex=n%pool.length,correct=pool[correctIndex],others=[];
      for(let step=1;step<pool.length&&others.length<3;step++){const candidate=pool[(correctIndex+step)%pool.length];if(candidate!==correct&&!others.includes(candidate))others.push(candidate);}
      if(others.length<3)break;
      const options=[correct,...others],shift=(n*3)%4;for(let k=0;k<shift;k++)options.push(options.shift());
      const answerIndex=options.indexOf(correct),opening=correct.split(/[,:;]/)[0].slice(0,76);
      questions.push({question:`Which statement in your notes explains “${opening}…”?`,options,answerIndex,explanation:`This is the matching statement from your uploaded material. ${correct.match(/\[Page \d+\]/)?.[0]||''}`,concept:opening});
    }
    if(questions.length<3)throw new Error('Add a little more source text to make a useful quiz.');
    return {questions};
  }
  function localResult(mode,t,extra={}) {
    const sentences=sourceSentences(t);
    if(mode==='lesson'||mode==='quick')return makeLocalLesson(t);
    if(mode==='ask'){
      const hits=relevantSentences(t,extra.question,6);
      return hits.length?`## From your material\n\n${hits.map(s=>`- ${s}`).join('\n')}\n\nThese are the closest passages I found for your question. I can quote and organize the source, but without an AI model I can’t reliably infer beyond what it says.`:`I couldn’t find a close match for that question in the extracted notes. Try using a term that appears in the material, or add more source notes.`;
    }
    if(mode==='targeted'){
      const hits=relevantSentences(t,extra.weakAreas,6),use=hits.length?hits:sentences.slice(0,5);
      return `## Review the ideas to strengthen\n\n${use.map((s,i)=>`### ${i+1}. Read, then recall\n${s}\n\n**Check yourself:** Close the notes and explain this idea in your own words. What key term or relationship does the sentence describe?`).join('\n\n')}\n\nCompare your explanation with the original sentence and note what you missed.`;
    }
    if(mode==='flashcards'){
      const cards=sentences.filter(s=>s.length<280).slice(0,12).map((s,i)=>({front:`Explain this idea from your notes (${i+1})`,back:s}));
      if(cards.length<3)throw new Error('There is not enough readable text for flashcards. Add more notes to this topic.');
      return {cards};
    }
    if(mode==='flowchart'){
      const chosen=(sentences.filter(s=>/\b(first|then|next|after|before|finally|therefore|because|leads to|results in|causes|when|if)\b/i.test(s)).concat(sentences)).filter((s,i,a)=>a.indexOf(s)===i).slice(0,8);
      if(chosen.length<3)throw new Error('There is not enough readable text to map the connections. Add more notes to this topic.');
      return {title:t.title,nodes:chosen.map(s=>({label:s.split(/[.!?:;]/)[0].slice(0,100),detail:s})),edges:chosen.slice(1).map((_,i)=>({from:i,to:i+1,label:'next idea in your notes'}))};
    }
    if(mode==='quiz')return makeLocalQuiz(t);
    throw new Error('That study activity is not available offline.');
  }
  async function requestTutor(mode,t,extra={}) { return {result:localResult(mode,t,extra),citations:[]}; }
  function tutorStatus() { document.getElementById('tutorStatus').textContent='Offline study tools · no API key'; }
  function go(view) {
    document.querySelectorAll('.view').forEach(el=>el.classList.remove('active-view'));
    document.getElementById(`${view}View`).classList.add('active-view');
    document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
    document.getElementById('crumbPage').textContent=({home:'Overview',learn:'Learn',revision:'Quick revision',progress:'My progress'})[view];
    render();window.scrollTo({top:0,behavior:'smooth'});
  }
  function render() {
    const c=course();
    document.getElementById('today').textContent=new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(new Date());
    document.getElementById('courseTitle').textContent=state.courses.length?c.title:'Upload material to begin';
    document.getElementById('learnTitle').textContent=state.courses.length?c.title:'Your study path';
    document.getElementById('topicTotal').textContent=`of ${topics().length} topics`;
    document.getElementById('mastered').textContent=topics().filter(mastered).length;
    document.getElementById('minutes').textContent=state.minutes||0;
    document.getElementById('streak').textContent=state.streak||1;
    renderCourses();renderTopicList();renderContinue();renderLesson();renderRevisionList();renderProgress();
  }
  function renderCourses() {
    const list=document.getElementById('courseList');
    list.innerHTML=state.courses.length?state.courses.map(c=>`<button class="course-button ${c.id===state.currentCourseId?'selected':''}" data-course="${safe(c.id)}"><span class="course-icon">▧</span><span class="course-label">${safe(c.title)}<br><small>${c.topics.length} topic${c.topics.length===1?'':'s'}</small></span>${c.id===state.currentCourseId?'<i class="dot"></i>':''}</button>`).join(''):'<p class="sidebar-empty">Upload material to begin.</p>';
    list.querySelectorAll('[data-course]').forEach(b=>b.onclick=()=>{state.currentCourseId=b.dataset.course;selectedTopic=firstUnlocked();save();render();});
    const select=document.getElementById('courseSelect');select.innerHTML=state.courses.length?state.courses.map(c=>`<option value="${safe(c.id)}" ${c.id===state.currentCourseId?'selected':''}>${safe(c.title)}</option>`).join(''):'<option value="">No study paths yet</option>';select.disabled=!state.courses.length;
  }
  function renderTopicList() {
    const host=document.getElementById('topicList');
    host.innerHTML=topics().length?topics().map((t,i)=>`<div class="topic-row ${mastered(t)?'done':''}" data-index="${i}"><span class="topic-num">${mastered(t)?'✓':String(i+1).padStart(2,'0')}</span><b class="topic-name">${safe(t.title)}</b><span class="topic-state ${mastered(t)?'done':''}">${mastered(t)?`Mastered · ${t.best||100}%`:!unlocked(i)?'Locked until previous topic is mastered':t.passes?`Mastery check ${t.passes}/2`:'Ready to begin'}</span><span class="progress-bar"><i style="width:${unlockPercent(t)}%"></i></span><span class="topic-arrow">${unlocked(i)?'›':'⌑'}</span></div>`).join(''):'<div class="empty-state">Upload a file or add a topic to create your learning path.</div>';
    host.querySelectorAll('.topic-row').forEach(row=>row.onclick=()=>{const i=Number(row.dataset.index);if(!unlocked(i)){toast('Master this topic to unlock the next one.');return}selectedTopic=i;go('learn');});
  }
  function renderContinue() {
    const index=firstUnlocked(),t=topics()[index],host=document.getElementById('continueCard');
    if(!t){host.innerHTML='<div class="empty-state">Your next step will appear here after you add study material.</div>';return;}
    host.innerHTML=`<div class="continue-card"><div class="course-art">✿</div><div class="continue-info"><small>${t.passes?'KEEP PRACTISING':'UP NEXT'}</small><b>${safe(t.title)}</b><p>${t.passes?`${t.passes}/2 mastery checks completed`:'Start with a guided lesson from your material.'}</p><div class="progress-bar"><i style="width:${unlockPercent(t)}%"></i></div></div><span class="continue-arrow">→</span></div>`;
    host.firstElementChild.onclick=()=>{selectedTopic=index;go('learn');};
  }
  function renderLesson() {
    const list=document.getElementById('lessonTopics'),host=document.getElementById('lessonContent');
    list.innerHTML=topics().map((t,i)=>`<button class="lesson-nav ${i===selectedTopic?'active':''} ${unlocked(i)?'':'locked'}" data-index="${i}"><span class="mini">${mastered(t)?'✓':unlocked(i)?String(i+1).padStart(2,'0'):'⌑'}</span>${safe(t.title)}</button>`).join('');
    list.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.index);if(!unlocked(i)){toast('Master the current topic to unlock this one.');return;}selectedTopic=i;renderLesson();});
    const t=topics()[selectedTopic];
    if(!t){host.innerHTML='<div class="empty-state">Add a study path, then your sourced lesson will appear here.</div>';return;}
    t.ai=t.ai||{};
    host.innerHTML=`<div class="lesson-kicker">TOPIC ${String(selectedTopic+1).padStart(2,'0')} · ${mastered(t)?'MASTERED':'YOUR MATERIAL ONLY'}</div><div class="lesson-title-row"><h2>${safe(t.title)}</h2><button id="askShortcut" class="button light">Ask a question</button></div><div class="lesson-tabs"><button class="lesson-tab ${t.activeTab==='ask'?'':'active'}" data-tab="lesson">Lesson</button><button class="lesson-tab ${t.activeTab==='ask'?'active':''}" data-tab="ask">Ask the tutor</button>${t.ai.targeted?'<button class="lesson-tab" data-tab="targeted">Targeted review</button>':''}</div><div id="lessonOutput"></div><div class="lesson-actions"><button id="quizStart" class="button primary">Take a mastery quiz</button><span class="helper">Two scores of 80% or more unlock the next topic.</span></div>`;
    host.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{t.activeTab=b.dataset.tab;renderLesson();});
    document.getElementById('askShortcut').onclick=()=>{t.activeTab='ask';renderLesson();};
    document.getElementById('quizStart').onclick=()=>startQuiz(t);
    renderLessonOutput(t);
    if(!t.ai.lesson&&!t.ai.loading&&!t.ai.error)loadLesson(t);
  }
  function renderLessonOutput(t) {
    const host=document.getElementById('lessonOutput');if(!host)return;
    if(t.activeTab==='ask'){
      host.innerHTML=`<div class="ask-box"><p>Ask about <b>${safe(t.title)}</b>. The tutor will use your notes and point to pages when possible.</p><form id="askForm"><textarea id="askInput" class="field" rows="3" placeholder="What would you like explained?" required></textarea><button class="button primary">Ask the tutor</button></form><div id="askAnswer">${t.ai.lastAnswer?`<div class="ai-prose">${markdown(t.ai.lastAnswer)}</div>`:''}</div></div>`;
      document.getElementById('askForm').onsubmit=async e=>{e.preventDefault();const q=document.getElementById('askInput').value.trim(),answer=document.getElementById('askAnswer');answer.innerHTML='<div class="ai-loading">Reading your material and preparing an explanation…</div>';try{const d=await requestTutor('ask',t,{question:q});t.ai.lastAnswer=d.result;save();renderLessonOutput(t);}catch(err){answer.innerHTML=errorPanel(err.message);bindErrorButtons(answer,()=>renderLessonOutput(t));}};return;
    }
    if(t.activeTab==='targeted'){
      host.innerHTML=t.ai.targetedLoading?loadingPanel('Re-teaching the ideas you missed…'):t.ai.targeted?`<div class="ai-prose">${markdown(t.ai.targeted)}</div>`:errorPanel('No targeted review is available yet.');return;
    }
    if(t.ai.loading){host.innerHTML=loadingPanel('Reading your uploaded material and building your lesson…');return;}
    if(t.ai.error){host.innerHTML=errorPanel(t.ai.error);bindErrorButtons(host,()=>loadLesson(t,true));return;}
    if(t.ai.lesson){host.innerHTML=`<div class="ai-prose">${markdown(t.ai.lesson)}</div><button id="refreshLesson" class="text-button">Refresh lesson ↻</button>`;document.getElementById('refreshLesson').onclick=()=>loadLesson(t,true);return;}
    host.innerHTML='<div class="ai-loading">Your lesson will appear here.</div>';
  }
  function loadingPanel(text){return `<div class="ai-loading"><span class="pulse"></span>${safe(text)}</div>`;}
  function errorPanel(message){return `<div class="ai-error"><b>This activity needs more source text.</b><p>${safe(message)}</p><button class="button light" data-retry>Try again</button></div>`;}
  function bindErrorButtons(host,retry){host.querySelector('[data-retry]')?.addEventListener('click',retry);}
  async function loadLesson(t,refresh=false){t.ai=t.ai||{};if(t.ai.loading)return;t.ai.loading=true;t.ai.error='';renderLessonOutput(t);try{const d=await requestTutor('lesson',t);t.ai.lesson=d.result;save();}catch(e){t.ai.error=e.message;}finally{t.ai.loading=false;if(topics()[selectedTopic]===t)renderLessonOutput(t);if(t.ai.error){const host=document.getElementById('lessonOutput');bindErrorButtons(host,()=>loadLesson(t,true));}}}
  async function loadTargeted(t,weak){t.ai.targetedLoading=true;t.activeTab='targeted';renderLesson();try{const d=await requestTutor('targeted',t,{weakAreas:weak});t.ai.targeted=d.result;save();}catch(e){t.ai.targeted=`**Tutor unavailable**\n\n${e.message}`;}finally{t.ai.targetedLoading=false;if(topics()[selectedTopic]===t)renderLesson();}}

  function renderRevisionList(){
    const host=document.getElementById('revisionCards'),workspace=document.getElementById('revisionWorkspace');host.hidden=false;workspace.hidden=true;
    host.innerHTML=topics().length?topics().map((t,i)=>`<article class="panel revision-card"><p class="eyebrow">${String(i+1).padStart(2,'0')} · ${safe(course().title.toUpperCase())}</p><h3>${safe(t.title)}</h3><p>${safe(t.summary||'Review your uploaded notes with a focused activity.')}</p><span class="tag">${mastered(t)?'Mastered':unlocked(i)?'Ready to review':'Locked'}</span><div class="revision-actions"><button class="button light" data-index="${i}" data-mode="flashcards" ${unlocked(i)?'':'disabled'}>Flashcards</button><button class="button light" data-index="${i}" data-mode="flowchart" ${unlocked(i)?'':'disabled'}>Flowchart</button><button class="button light" data-index="${i}" data-mode="quick" ${unlocked(i)?'':'disabled'}>Quick teach</button></div></article>`).join(''):'<div class="empty-state">Upload material to create revision activities.</div>';
    host.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>openRevision(Number(b.dataset.index),b.dataset.mode));
  }
  function revisionKey(mode){return mode==='quick'?'quickTeach':mode;}
  async function openRevision(index,mode){
    selectedTopic=index;const t=topics()[index],workspace=document.getElementById('revisionWorkspace');workspace.hidden=false;document.getElementById('revisionCards').hidden=true;flashIndex=0;flashBack=false;renderRevisionWorkspace(t,mode);const key=revisionKey(mode);if(t.ai?.[key])return;t.ai=t.ai||{};t.ai[key+'Loading']=true;t.ai[key+'Error']='';
    try{const d=await requestTutor(mode==='quick'?'lesson':mode,t);t.ai[key]=d.result;save();}catch(e){t.ai[key+'Error']=e.message;}finally{t.ai[key+'Loading']=false;renderRevisionWorkspace(t,mode);}
  }
  function renderRevisionWorkspace(t,mode){
    const host=document.getElementById('revisionWorkspace'),key=revisionKey(mode),data=t.ai?.[key];host.hidden=false;document.getElementById('revisionCards').hidden=true;
    let body='';
    if(t.ai?.[key+'Loading'])body=loadingPanel('Using your material to prepare this revision activity…');
    else if(t.ai?.[key+'Error'])body=errorPanel(t.ai[key+'Error']);
    else if(!data)body=loadingPanel('Preparing your activity…');
    else if(mode==='quick')body=`<div class="ai-prose">${markdown(data)}</div>`;
    else if(mode==='flashcards'){
      const cards=data.cards||[],card=cards[flashIndex]||{};
      body=`<p class="eyebrow">FLASHCARD ${flashIndex+1} OF ${cards.length}</p><button id="flipCard" class="flashcard"><span>${flashBack?'ANSWER':'PROMPT'}</span><strong>${safe(flashBack?card.back:card.front)}</strong><small>Click to ${flashBack?'see the prompt':'reveal the answer'}</small></button><div class="flash-controls"><button id="prevCard" class="button light" ${flashIndex===0?'disabled':''}>← Previous</button><button id="markKnown" class="button light">Mark as known</button><button id="nextCard" class="button primary" ${flashIndex>=cards.length-1?'disabled':''}>Next →</button></div><p class="helper center">${t.knownCards||0} cards marked as known</p>`;
    } else {
      const nodes=data.nodes||[];body=`<p class="eyebrow">CONCEPT FLOW · ${safe(data.title||t.title)}</p><div class="flowchart">${nodes.map((n,i)=>`<div class="flow-node"><span>${i+1}</span><div><b>${safe(n.label)}</b><p>${safe(n.detail||'')}</p></div></div>${i<nodes.length-1?`<div class="flow-arrow">↓ ${safe((data.edges||[]).find(e=>e.from===i&&e.to===i+1)?.label||'leads to')}</div>`:''}`).join('')}</div>`;
    }
    host.innerHTML=`<div class="section-head"><div><p class="eyebrow">${safe(course().title.toUpperCase())} · REVISION</p><h2>${safe(t.title)}</h2></div><button id="backRevision" class="text-button">← All revision tools</button></div><div class="revision-tabs"><button class="button ${mode==='flashcards'?'primary':'light'}" data-mode="flashcards">Flashcards</button><button class="button ${mode==='flowchart'?'primary':'light'}" data-mode="flowchart">Flowchart</button><button class="button ${mode==='quick'?'primary':'light'}" data-mode="quick">Quick teach</button></div>${body}`;
    host.querySelector('#backRevision').onclick=()=>{host.hidden=true;document.getElementById('revisionCards').hidden=false;};
    host.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>openRevision(topics().indexOf(t),b.dataset.mode));
    bindErrorButtons(host,()=>openRevision(topics().indexOf(t),mode));
    host.querySelector('#flipCard')?.addEventListener('click',()=>{flashBack=!flashBack;renderRevisionWorkspace(t,mode);});
    host.querySelector('#prevCard')?.addEventListener('click',()=>{flashIndex--;flashBack=false;renderRevisionWorkspace(t,mode);});
    host.querySelector('#nextCard')?.addEventListener('click',()=>{flashIndex++;flashBack=false;renderRevisionWorkspace(t,mode);});
    host.querySelector('#markKnown')?.addEventListener('click',()=>{t.knownCards=(t.knownCards||0)+1;save();if(flashIndex<(data.cards||[]).length-1)flashIndex++;flashBack=false;renderRevisionWorkspace(t,mode);});
  }

  function renderProgress(){
    const ts=topics(),done=ts.filter(mastered).length,active=ts.filter((t,i)=>unlocked(i)&&!mastered(t)).length,locked=ts.length-done-active,pct=ts.length?Math.round(done/ts.length*100):0;
    document.getElementById('progressPercent').textContent=`${pct}%`;document.getElementById('overallBar').style.width=`${pct}%`;document.getElementById('progressCaption').textContent=pct?'You’re making steady progress.':'Your learning journey starts here.';document.getElementById('pMastered').textContent=done;document.getElementById('pActive').textContent=active;document.getElementById('pLocked').textContent=locked;
    document.getElementById('progressTopics').innerHTML=ts.map((t,i)=>`<div class="progress-topic"><span><b>${safe(t.title)}</b><small>${mastered(t)?'Topic mastered':!unlocked(i)?'Complete the topic before this one':`Best quiz score: ${t.best||'—'}`}</small></span><div class="progress-bar"><i style="width:${unlockPercent(t)}%"></i></div><em>${unlockPercent(t)}%</em></div>`).join('')||'<div class="empty-state">Progress will appear after you add material.</div>';
  }

  async function startQuiz(t){
    const dialog=document.getElementById('quizDialog'),body=document.getElementById('quizBody');dialog.showModal();body.innerHTML=loadingPanel('Building a quiz from your uploaded material…');
    try{const d=await requestTutor('quiz',t),questions=(d.result.questions||[]).map(q=>[q.question,q.options,q.answerIndex,q.explanation,q.concept]);if(questions.length<3)throw new Error('This topic needs more source detail for a meaningful mastery quiz. Add notes or pages, then try again.');if(questions.some(q=>!q[0]||q[1]?.length!==4||!Number.isInteger(q[2])||q[2]<0||q[2]>3))throw new Error('The tutor returned an invalid quiz. Please retry.');quiz={topic:t,questions,index:0,answers:[],selected:null,locked:false};renderQuestion();}
    catch(e){body.innerHTML=errorPanel(e.message);bindErrorButtons(body,()=>startQuiz(t));}
  }
  function renderQuestion(){
    const q=quiz.questions[quiz.index],locked=quiz.locked,selected=quiz.selected;
    document.getElementById('quizBody').innerHTML=`<div class="quiz-progress">MASTERY CHECK · QUESTION ${quiz.index+1} OF ${quiz.questions.length}</div><h2 class="quiz-question">${safe(q[0])}</h2><div class="quiz-options">${q[1].map((option,i)=>`<button class="quiz-option ${selected===i?'selected':''} ${locked&&i===q[2]?'correct':''} ${locked&&selected===i&&selected!==q[2]?'wrong':''}" data-option="${i}" ${locked?'disabled':''}>${String.fromCharCode(65+i)}. ${safe(option)}</button>`).join('')}</div>${locked?`<div class="quiz-feedback">${selected===q[2]?'Correct. ':'Not quite. '}${safe(q[3])}</div>`:''}<div class="quiz-controls"><span class="helper">${locked?'Answer recorded':'Choose the best answer'}</span><button id="quizNext" class="button primary" ${selected===null?'disabled':''}>${locked?(quiz.index===quiz.questions.length-1?'See results':'Next question'):'Check answer'}</button></div>`;
    document.querySelectorAll('.quiz-option').forEach(b=>b.onclick=()=>{quiz.selected=Number(b.dataset.option);renderQuestion();});
    document.getElementById('quizNext').onclick=()=>{if(!quiz.locked){quiz.locked=true;quiz.answers.push(quiz.selected===q[2]);renderQuestion();}else if(quiz.index<quiz.questions.length-1){quiz.index++;quiz.selected=null;quiz.locked=false;renderQuestion();}else showResults();};
  }
  function showResults(){
    const t=quiz.topic,q=quiz.questions,score=Math.round(quiz.answers.filter(Boolean).length/q.length*100);t.best=Math.max(t.best||0,score);t.passes=score>=80?(t.passes||0)+1:0;state.minutes=(state.minutes||0)+q.length;save();
    const isDone=mastered(t),missed=quiz.answers.map((ok,i)=>ok?null:q[i][4]||q[i][3]||q[i][0]).filter(Boolean);
    document.getElementById('quizBody').innerHTML=`<div class="quiz-result"><div class="result-icon">${isDone?'✦':score>=80?'✓':'↻'}</div><p class="eyebrow">${isDone?'TOPIC MASTERED':score>=80?'MASTERY CHECK PASSED':'KEEP PRACTISING'}</p><h2>${isDone?'Well done.':score>=80?'You’re getting there.':'Let’s strengthen a few ideas.'}</h2><div class="result-score">${score}%</div><p>${isDone?'You passed two checks and unlocked the next topic.':score>=80?'One more score of 80% or higher confirms mastery.':'Review the missed ideas and try again. The next topic remains locked.'}</p></div>${missed.length?`<div class="callout"><b>Review these ideas</b><ul>${missed.map(x=>`<li>${safe(x)}</li>`).join('')}</ul><button id="targetedButton" class="button light">Teach me these again</button></div>`:''}<div class="quiz-controls"><button id="closeResult" class="button light">Close</button><button id="continueResult" class="button primary">${score<80?'Try again':'Continue'}</button></div>`;
    document.getElementById('closeResult').onclick=()=>{document.getElementById('quizDialog').close();render();};
    document.getElementById('continueResult').onclick=()=>{document.getElementById('quizDialog').close();if(score<80)startQuiz(t);else{if(isDone)selectedTopic=Math.min(selectedTopic+1,topics().length-1);render();toast(isDone?'Next topic unlocked!':'One more strong check-in will confirm mastery.');}};
    document.getElementById('targetedButton')?.addEventListener('click',()=>{document.getElementById('quizDialog').close();go('learn');loadTargeted(t,missed.join('; '));});
    render();
  }

  function makeTopic(title,notes=''){
    const sentences=(notes.match(/[^.!?]+[.!?]?/g)||[]).map(x=>x.trim()).filter(x=>x.length>20);
    return{id:`topic-${Date.now()}-${Math.random().toString(16).slice(2,6)}`,title,notes,summary:sentences.slice(0,3).join(' ')||'Add source notes to create a clear, material-based lesson.',key:sentences.slice(0,6),passes:0};
  }
  function addPath(title,topic){const entry={id:`course-${Date.now()}`,title,topics:[topic]};state.courses.push(entry);state.currentCourseId=entry.id;selectedTopic=0;save();render();go('learn');}
  function addTopic(title,notes=''){
    title=title.trim();if(!title)return;
    if(!state.courses.length){addPath(title,makeTopic(title,notes));document.getElementById('topicDialog').close();return;}
    course().topics.push(makeTopic(title,notes));selectedTopic=course().topics.length-1;save();document.getElementById('topicDialog').close();render();go('learn');toast('Topic added to this study path.');
  }
  function openUpload(){document.getElementById('uploadStatus').textContent='';document.getElementById('uploadDialog').showModal();}
  async function importFile(file){
    const status=document.getElementById('uploadStatus');status.textContent='Reading your material…';status.style.color='';
    try{
      const sourceLines=[],isPdf=/\.pdf$/i.test(file.name);
      if(isPdf){
        if(!window.pdfjsLib)throw new Error('The PDF reader could not load. Check your internet connection or use a text file.');
        pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
        for(let pageNo=1;pageNo<=Math.min(pdf.numPages,80);pageNo++){
          const page=await pdf.getPage(pageNo),items=await page.getTextContent();
          const text=items.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('');
          text.split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean).forEach(line=>sourceLines.push({label:`[Page ${pageNo}]`,text:line}));
        }
      }else{
        const text=await file.text();let section='';
        text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach(line=>{const h=line.match(/^#{1,3}\s+(.+)/);if(h)section=h[1].replace(/[#*_`]/g,'').trim();sourceLines.push({label:section?`[Section: ${section}]`:'',text:line.replace(/^#{1,6}\s+/,''),isHeading:!!h});});
      }
      if(!sourceLines.length)throw new Error('No readable text found. Scanned-image PDFs need OCR before they can be used.');
      const title=file.name.replace(/\.(pdf|txt|md)$/i,'').replace(/[_-]+/g,' ').trim()||'Study material';
      const isHeading=line=>line.isHeading||(/^[A-Z0-9][A-Z0-9\s:,&()/-]{2,78}$/.test(line.text)&&line.text.split(/\s+/).length<=10);
      let marks=sourceLines.map((line,i)=>isHeading(line)?i:-1).filter(i=>i>=0);
      marks=[...new Set(marks)].filter((i,n)=>!(n===0&&i===0&&sourceLines[i].text.toLowerCase()===title.toLowerCase()));
      let groups=[];
      if(marks.length>=2){if(marks[0]>0)groups.push({title:'Introduction',lines:sourceLines.slice(0,marks[0])});marks.forEach((at,i)=>groups.push({title:sourceLines[at].text,lines:sourceLines.slice(at+1,marks[i+1]??sourceLines.length)}));}
      else if(marks.length===1)groups=[{title:sourceLines[marks[0]].text,lines:sourceLines.slice(marks[0]+1)}];
      if(!groups.length)groups=[{title,lines:sourceLines}];
      const sections=groups.flatMap(group=>{
        const full=(group.lines.length?group.lines:sourceLines).map(x=>`${x.label} ${x.text}`.trim()).join('\n');let rest=full;const parts=[];
        while(rest.length){let end=Math.min(12000,rest.length);if(end<rest.length){const breakAt=rest.lastIndexOf('\n',end);if(breakAt>6000)end=breakAt;}parts.push(rest.slice(0,end).trim());rest=rest.slice(end).trimStart();}
        return parts.map((notes,i)=>({title:parts.length>1?`${group.title} · Part ${i+1}`:group.title,notes}));
      });
      const newCourse={id:`course-${Date.now()}`,title,topics:sections.map((s,i)=>{const sentences=s.notes.split(/(?<=[.!?])\s+/).filter(x=>x.length>25);return{id:`file-${Date.now()}-${i}`,title:s.title.slice(0,80),notes:s.notes,summary:sentences.slice(0,3).join(' ')||s.title,key:sentences.slice(0,6),passes:0};})};
      state.courses.push(newCourse);state.currentCourseId=newCourse.id;selectedTopic=0;save();document.getElementById('uploadDialog').close();render();go('learn');toast(`Study path created from ${file.name}`);
    }catch(error){status.textContent=error.message;status.style.color='#a35c4e';}
  }

  function exportProgress(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='studywise-progress.json';a.click();URL.revokeObjectURL(url);toast('Progress backup downloaded.');}
  async function importProgress(file){try{const data=JSON.parse(await file.text());if(!Array.isArray(data.courses))throw new Error('This file does not contain Studywise progress.');state=data;if(!state.courses.some(c=>c.id===state.currentCourseId))state.currentCourseId=state.courses[0]?.id||null;save();selectedTopic=firstUnlocked();render();toast('Progress imported successfully.');}catch(e){toast(e.message||'Could not import that file.');}}

  document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>go(b.dataset.view));
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
  document.getElementById('uploadTop').onclick=openUpload;document.getElementById('sideAdd').onclick=openUpload;
  document.getElementById('courseSelect').onchange=e=>{state.currentCourseId=e.target.value;selectedTopic=firstUnlocked();save();render();};
  document.getElementById('addTopicButton').onclick=()=>document.getElementById('topicDialog').showModal();
  document.getElementById('createManual').onclick=()=>{const title=document.getElementById('manualCourse').value.trim();if(title){addPath(title,makeTopic(title));document.getElementById('manualCourse').value='';document.getElementById('uploadDialog').close();}};
  document.getElementById('saveTopic').onclick=()=>addTopic(document.getElementById('topicName').value,document.getElementById('topicNotes').value);
  document.getElementById('fileInput').onchange=e=>{const f=e.target.files[0];if(f)importFile(f);e.target.value='';};
  const drop=document.getElementById('dropZone');drop.ondragover=e=>{e.preventDefault();drop.style.background='#eef5ec';};drop.ondragleave=()=>drop.style.background='';drop.ondrop=e=>{e.preventDefault();drop.style.background='';const f=e.dataTransfer.files[0];if(f)importFile(f);};
  document.getElementById('exportProgress').onclick=exportProgress;document.getElementById('importProgress').onchange=e=>{if(e.target.files[0])importProgress(e.target.files[0]);e.target.value='';};
  render();tutorStatus();
})();
