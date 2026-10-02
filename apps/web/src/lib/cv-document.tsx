import React from 'react';
import {Document,Page,Text,View,Link,StyleSheet,Font} from '@react-pdf/renderer';
import {cvLabels,cvSectionKeys,hasCvEntry,safeCvWebsite,type CvDraft} from '../../../../packages/core/src/cv';

export function registerCvFonts(base='/fonts') {
  Font.register({family:'CvSans',fonts:[{src:`${base}/cv-regular.woff`,fontWeight:400},{src:`${base}/cv-bold.woff`,fontWeight:700}]});
}
const styles=StyleSheet.create({
  page:{fontFamily:'CvSans',fontSize:9,color:'#202020',padding:30,paddingBottom:48},
  header:{marginBottom:18},
  darkHeader:{backgroundColor:'#191919',color:'#ffffff',padding:25,marginTop:-30,marginHorizontal:-30,marginBottom:18},
  name:{fontSize:25,fontWeight:700,lineHeight:1.2,marginBottom:5},
  // Resolve line spacing with an explicit font size; keep it off the page's dynamic footer.
  headline:{fontSize:11,marginBottom:8},summary:{fontSize:9,marginTop:8,lineHeight:1.45},
  contact:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:10,fontSize:8},
  contactItem:{maxWidth:'100%'},
  section:{marginBottom:15},
  heading:{fontSize:12,fontWeight:700,marginBottom:8,paddingBottom:4,borderBottomWidth:0.7},
  skills:{flexDirection:'row',flexWrap:'wrap',gap:5},
  skill:{backgroundColor:'#242424',color:'#ffffff',fontSize:8,paddingVertical:3,paddingHorizontal:6,borderRadius:2,maxWidth:'100%'},
  entry:{marginBottom:10},entryTitle:{fontSize:11,fontWeight:700},
  organization:{fontSize:10},meta:{fontSize:8,marginTop:2,marginBottom:4},
  bullet:{flexDirection:'row',marginTop:3},dot:{width:10},bulletText:{fontSize:9,flex:1,lineHeight:1.45},
  footer:{fontFamily:'CvSans',position:'absolute',bottom:22,left:30,right:30,textAlign:'right',fontSize:8,color:'#737373'},
});

/** The preview and download both render this document, so pagination is identical. */
export default function CvDocument({cv}:{cv:CvDraft}) {
  const c=cv.content,labels=cvLabels[cv.language],accent=cv.template==='accent';
  const color=accent?'#087d79':'#222222',website=safeCvWebsite(c.website);
  return <Document title={cv.title} author={c.name} language={cv.language}>
    <Page size="A4" style={styles.page} wrap>
      <View style={accent?styles.darkHeader:styles.header}>
        {c.name.trim()&&<Text style={styles.name}>{c.name}</Text>}
        {c.headline.trim()&&<Text style={[styles.headline,{color:accent?'#39d4cc':color}]}>{c.headline}</Text>}
        {c.summary.trim()&&<Text style={styles.summary} orphans={3} widows={3}>{c.summary}</Text>}
        <View style={styles.contact}>
          {c.email&&<Link style={[styles.contactItem,{color:accent?'#ffffff':color}]} src={`mailto:${encodeURIComponent(c.email)}`}>{c.email}</Link>}
          {[c.phone,c.location].filter(Boolean).map((text,i)=><Text style={styles.contactItem} key={i}>{text}</Text>)}
          {c.website&&(website?<Link style={[styles.contactItem,{color:accent?'#ffffff':color}]} src={website}>{c.website}</Link>:<Text style={styles.contactItem}>{c.website}</Text>)}
        </View>
      </View>
      {c.skills.some(s=>s.trim())&&<View style={styles.section}>
        <Text style={[styles.heading,{color,borderBottomColor:color}]} minPresenceAhead={35}>{labels.skills}</Text>
        {accent?<View style={styles.skills}>{c.skills.filter(s=>s.trim()).map((skill,i)=><Text key={i} style={styles.skill}>{skill}</Text>)}</View>:<Text>{c.skills.filter(s=>s.trim()).join(' · ')}</Text>}
      </View>}
      {cvSectionKeys.map(key=>{
        const entries=c[key].filter(hasCvEntry);
        return entries.length>0&&<View key={key} style={styles.section}>
          <Text style={[styles.heading,{color,borderBottomColor:color}]} minPresenceAhead={65}>{labels[key]}</Text>
          {entries.map((entry,i)=><View key={i} style={styles.entry}>
            <View wrap={false} minPresenceAhead={entry.details.trim()?28:0}>
              {entry.title&&<Text style={styles.entryTitle}>{entry.title}</Text>}
              {entry.organization&&<Text style={styles.organization}>{entry.organization}</Text>}
              {(entry.dates||entry.location)&&<Text style={[styles.meta,{color}]}>{[entry.dates,entry.location].filter(Boolean).join(' | ')}</Text>}
            </View>
            {entry.details.split('\n').map(line=>line.trim().replace(/^[-•]\s*/, '')).filter(Boolean).map((line,j)=><View key={j} style={styles.bullet}>
              <Text style={[styles.dot,{color}]}>•</Text><Text style={styles.bulletText} orphans={2} widows={2}>{line}</Text>
            </View>)}
          </View>)}
        </View>;
      })}
      <Text style={styles.footer} fixed render={({pageNumber,totalPages})=>`${labels.page} ${pageNumber} / ${totalPages}`}/>
    </Page>
  </Document>;
}
