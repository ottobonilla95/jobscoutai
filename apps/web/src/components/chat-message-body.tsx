import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatMessageBody({role,text}:{role:'user'|'assistant';text:string}){
  if(role==='user')return <p>{text}</p>;
  return <div className="chat-markdown"><Markdown
    remarkPlugins={[remarkGfm]}
    skipHtml
    disallowedElements={['img']}
    components={{a:({href,children,title})=><a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>}}
  >{text}</Markdown></div>;
}
