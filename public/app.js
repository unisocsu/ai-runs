(function () {
  'use strict';
  function id(s) { return document.getElementById(s); }
  function has(el,c) { return (' '+el.className+' ').indexOf(' '+c+' ')>=0; }
  function add(el,c) { if(!has(el,c)) el.className+=(el.className?' ':'')+c; }
  function remove(el,c) { el.className=(' '+el.className+' ').replace(' '+c+' ',' ').replace(/^\s+|\s+$/g,''); }
  function toggle(el,c) { if(has(el,c)) remove(el,c); else add(el,c); }
  function parseJson(s) { try { return JSON.parse(s||'{}'); } catch(e) { return {}; } }

  var API='https://api.github.com/repos/unisocsu/ai-runs';
  function readCookie(name) {
    var parts=document.cookie?document.cookie.split(';'):[],i,p;
    for(i=0;i<parts.length;i++){p=parts[i].replace(/^\s+/,'');if(p.indexOf(name+'=')===0){try{return decodeURIComponent(p.substring(name.length+1));}catch(e){return '';}}}
    return '';
  }
  function writeCookie(name,value,days) {
    var expires=new Date(new Date().getTime()+days*86400000).toUTCString();
    document.cookie=name+'='+encodeURIComponent(value)+'; expires='+expires+'; path=/; SameSite=Lax'+(window.location.protocol==='https:'?'; Secure':'');
  }
  function eraseCookie(name) {
    document.cookie=name+'=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax'+(window.location.protocol==='https:'?'; Secure':'');
  }

  var form=id('chat-form'), input=id('prompt'), messages=id('messages'), welcome=id('welcome'),
      progress=id('progress'), err=id('error'), settings=id('settings'), key=id('access-key'),
      send=id('send'), busy=false, timer=null, access='', resetNext=true;
  access=readCookie('ai-runs-github-token'); key.value=access;
  var settingsLabel=settings.querySelector('label'), settingsHelp=settings.querySelector('small');
  if(settingsLabel)settingsLabel.innerHTML='Fine-grained GitHub token';
  key.placeholder='Token for unisocsu/ai-runs';
  if(settingsHelp)settingsHelp.innerHTML='הטוקן נשמר בעוגיית דפדפן ל־30 יום ונשלח ישירות אל api.github.com. דרושות הרשאות Contents read/write ו־Actions read/write לריפו הזה בלבד. אל תשתמש בטוקן רחב-הרשאות.';
  id('settings-toggle').onclick=function(){toggle(settings,'hidden');};
  id('save-key').onclick=function(){
    access=key.value.replace(/^\s+|\s+$/g,'');
    if(access) writeCookie('ai-runs-github-token',access,30); else eraseCookie('ai-runs-github-token');
    remove(settings,'hidden'); add(settings,'hidden');
    showError('');
  };
  id('new-chat').onclick=function(){
    if(busy)return;
    while(messages.firstChild)messages.removeChild(messages.firstChild);
    add(messages,'hidden'); remove(welcome,'hidden'); showError('');
    resetNext=true;
  };
  var suggestions=document.querySelectorAll('.suggestion'),i;
  for(i=0;i<suggestions.length;i++){suggestions[i].onclick=function(){input.value=this.getAttribute('data-prompt')||'';input.focus();};}
  input.onkeydown=function(e){
    e=e||window.event;
    if((e.key==='Enter'||e.keyCode===13)&&!e.shiftKey){
      if(e.preventDefault)e.preventDefault();else e.returnValue=false;
      if(form.requestSubmit)form.requestSubmit();else submit();
    }
  };
  form.onsubmit=function(e){e=e||window.event;if(e.preventDefault)e.preventDefault();submit();return false;};

  function makeId(prefix){return prefix+(new Date().getTime().toString(36))+Math.random().toString(36).slice(2,12);}
  function encodePath(path){return path.split('/').map(function(part){return encodeURIComponent(part);}).join('/');}
  function encodeBase64(text){return window.btoa(unescape(encodeURIComponent(text)));}
  function decodeBase64(text){return decodeURIComponent(escape(window.atob((text||'').replace(/\s/g,''))));}
  function gh(method,path,body,done){
    var x=new XMLHttpRequest(),raw;
    x.open(method,API+path,true);
    x.setRequestHeader('Accept','application/vnd.github+json');
    x.setRequestHeader('Authorization','Bearer '+access);
    x.setRequestHeader('X-GitHub-Api-Version','2022-11-28');
    if(body)x.setRequestHeader('Content-Type','application/json');
    x.onreadystatechange=function(){if(x.readyState===4){raw=parseJson(x.responseText);done(x.status,raw);}};
    x.onerror=function(){done(0,{message:'שגיאת תקשורת מול GitHub API.'});};
    x.send(body?JSON.stringify(body):null);
  }
  function readFile(path,done){
    gh('GET','/contents/'+encodePath(path)+'?ref=main',null,function(status,data){
      if(status!==200){done(status,data,null);return;}
      try{done(200,JSON.parse(decodeBase64(data.content||'')),data.sha);}
      catch(e){done(422,{message:'קובץ JSON לא תקין: '+path},data.sha);}
    });
  }
  function writeFile(path,value,sha,done){
    var body={message:'AI Runs chat: update '+path,content:encodeBase64(JSON.stringify(value,null,2)),branch:'main'};
    if(sha)body.sha=sha;
    gh('PUT','/contents/'+encodePath(path),body,function(status,data){done(status,data);});
  }
  function errorFrom(data,status){
    if(status===401)return 'GitHub דחה את הטוקן. בדוק שהוא תקף ומוגדר לריפו הזה.';
    if(status===403)return 'אין הרשאות מספיקות. לטוקן דרוש Contents: Read and write וגם Actions: Read and write.';
    if(status===404)return 'הקובץ לא נמצא בריפו. בדוק שהריפו unisocsu/ai-runs קיים ושיש הרשאות מתאימות.';
    return data&&data.message?data.message:'בקשת GitHub API נכשלה (HTTP '+status+').';
  }
  function submit(){
    var p=input.value.replace(/^\s+|\s+$/g,''),maxTokens=Number(id('max-tokens').value),messageId=makeId('m'),
        resetHistory=resetNext;
    if(!p||busy)return;
    access=key.value.replace(/^\s+|\s+$/g,'')||access;
    if(!access){remove(settings,'hidden');showError('צריך להזין Fine-grained GitHub token. הוא נשלח ישירות ל־api.github.com.');key.focus();return;}
    resetNext=false;
    busy=true;send.disabled=true;input.disabled=true;
    remove(messages,'hidden');add(welcome,'hidden');showError('');
    message('user',p);input.value='';
    var started=new Date().getTime();
    remove(progress,'hidden');
    id('progress-title').innerHTML='בודק אם יש סשן פעיל';
    id('progress-detail').innerHTML='הדפדפן עובד ישירות מול GitHub API…';
    timer=window.setInterval(function(){var s=Math.floor((new Date().getTime()-started)/1000);id('elapsed').innerHTML=Math.floor(s/60)+':'+('0'+s%60).slice(-2);},1000);
    routeMessage(p,maxTokens,messageId,resetHistory,0);
  }

  function routeMessage(prompt,maxTokens,messageId,resetHistory,attempt){
    if(attempt>4){showError('לא הצלחתי לעדכן את מצב הסשן עקב כמה בקשות מקבילות. שלח שוב.');finish();return;}
    readFile('runtime/session.json',function(status,session,sha){
      if(status===401||status===403){showError(errorFrom(session,status));finish();return;}
      if(status!==200&&status!==404){showError(errorFrom(session,status));finish();return;}
      var active=status===200&&session&&(session.status==='starting'||session.status==='running')&&Date.parse(session.expiresAt||'')>new Date().getTime();
      if(!active){startSession(sha,prompt,maxTokens,messageId,resetHistory,attempt);return;}
      if(session.run_id){
        gh('GET','/actions/runs/'+encodeURIComponent(session.run_id),null,function(runStatus,run){
          if(runStatus===200&&run.status==='completed')startSession(sha,prompt,maxTokens,messageId,resetHistory,attempt);
          else queueMessage(session.sessionId,prompt,maxTokens,messageId,resetHistory);
        });
      }else{
        queueMessage(session.sessionId,prompt,maxTokens,messageId,resetHistory);
      }
    });
  }

  function startSession(sha,prompt,maxTokens,messageId,resetHistory,attempt){
    var now=new Date(),sessionId=makeId('s');
    var state={sessionId:sessionId,status:'starting',createdAt:now.toISOString(),updatedAt:now.toISOString(),
      expiresAt:new Date(now.getTime()+6*60*60*1000).toISOString()};
    id('progress-title').innerHTML='יוצר סשן';
    writeFile('runtime/session.json',state,sha,function(status,data){
      if(status===409||status===422){routeMessage(prompt,maxTokens,messageId,resetHistory,attempt+1);return;}
      if(status!==200&&status!==201){showError(errorFrom(data,status));finish();return;}
      createQueuedResult(sessionId,messageId,function(resultStatus,resultData){
        if(resultStatus!==200&&resultStatus!==201){showError(errorFrom(resultData,resultStatus));finish();return;}
        id('progress-detail').innerHTML='מפעיל GitHub Actions רק עבור ההודעה הראשונה בסשן…';
        gh('POST','/actions/workflows/infer.yml/dispatches',{
          ref:'main',inputs:{prompt:prompt,max_tokens:String(maxTokens),reset_history:resetHistory?'true':'false',session_id:sessionId,message_id:messageId}
        },function(dispatchStatus,dispatchData){
          if(dispatchStatus===204||dispatchStatus===200){poll(messageId,0);return;}
          markSession(sessionId,'failed');
          showError('GitHub לא הצליח להפעיל את ה-workflow. '+errorFrom(dispatchData,dispatchStatus)+' ודא שלטוקן יש Actions: Read and write.');
          finish();
        });
      });
    });
  }

  function createQueuedResult(sessionId,messageId,done){
    writeFile('runtime/results/'+messageId+'.json',{status:'queued',sessionId:sessionId,messageId:messageId,createdAt:new Date().toISOString()},null,done);
  }
  function queueMessage(sessionId,prompt,maxTokens,messageId,resetHistory){
    id('progress-title').innerHTML='מכניס לתור';
    id('progress-detail').innerHTML='נמצא סשן פעיל; לא מפעיל workflow נוסף.';
    createQueuedResult(sessionId,messageId,function(resultStatus,resultData){
      if(resultStatus!==200&&resultStatus!==201){showError(errorFrom(resultData,resultStatus));finish();return;}
      var item={sessionId:sessionId,messageId:messageId,prompt:prompt,max_tokens:maxTokens,reset_history:!!resetHistory,createdAt:new Date().toISOString()};
      writeFile('runtime/queue/'+sessionId+'/'+messageId+'.json',item,null,function(status,data){
        if(status!==200&&status!==201){showError(errorFrom(data,status));finish();return;}
        poll(messageId,0);
      });
    });
  }
  function markSession(sessionId,status){
    readFile('runtime/session.json',function(code,current,sha){
      if(code!==200||!current||current.sessionId!==sessionId)return;
      current.status=status;current.updatedAt=new Date().toISOString();
      writeFile('runtime/session.json',current,sha,function(){});
    });
  }
  function poll(messageId,attempt){
    if(!busy)return;
    window.setTimeout(function(){
      if(!busy)return;
      readFile('runtime/results/'+messageId+'.json',function(status,data){
        if(status===401||status===403){showError(errorFrom(data,status));finish();return;}
        if(status===200&&data.status==='completed'){
          if(data.conclusion==='success'){message('assistant',data.answer||'ההרצה הסתיימה אך לא נמצאה תשובה.');finish();}
          else{showError(data.error||'הרצת ה-AI נכשלה. בדוק את לוג ההרצה ב-GitHub Actions.');finish();}
          return;
        }
        if(status!==200&&status!==404&&attempt>=4){showError(errorFrom(data,status));finish();return;}
        id('progress-title').innerHTML=status===404?'ממתין לקובץ התשובה':(data.status==='queued'?'בתור':'ה-AI חושב');
        id('progress-detail').innerHTML=data.status==='queued'?'ההודעה ממתינה לתור בסשן הפעיל.':'הדף בודק את קובץ התשובה ב-GitHub…';
        poll(messageId,status===200?0:attempt+1);
      });
    },6000);
  }

  function message(role,text){
    var item=document.createElement('article');item.className='message '+role;
    var avatar=document.createElement('div');avatar.className='avatar';avatar.appendChild(document.createTextNode(role==='user'?'●':'✳'));
    var body=document.createElement('div');body.className='message-body';
    var label=document.createElement('div');label.className='message-label';label.appendChild(document.createTextNode(role==='user'?'אתה':'AI Runs Agent · Qwen3-8B'));
    var content=document.createElement('div');content.className='message-text';content.appendChild(document.createTextNode(text));
    body.appendChild(label);body.appendChild(content);item.appendChild(avatar);item.appendChild(body);messages.appendChild(item);
    if(item.scrollIntoView)item.scrollIntoView(false);
  }
  function finish(){busy=false;send.disabled=false;input.disabled=false;add(progress,'hidden');if(timer)window.clearInterval(timer);input.focus();}
  function showError(text){err.innerHTML='';if(text)err.appendChild(document.createTextNode(text));if(text)remove(err,'hidden');else add(err,'hidden');}
}());
