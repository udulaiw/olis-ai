// Wording that says a question is about the student's own past: earlier chats
// ("continue the plan we made") or what they told OLIS ("what did I tell you about my exam").
//
// Shared by the server router and the browser (src/lib/recall.ts), so both agree on
// when previous conversations are searched. Keep this file dependency-free.

/** Refers to an earlier conversation. */
export const HISTORY_CUE =
  /\b(we (made|discussed|talked about|did|wrote|planned|covered)|you (made|gave|wrote|told|said|suggested|explained)( me)?|previous(ly)?|last time|(said|told|discussed|made|asked)( (it|this|that|you|me))? (before|earlier)|yesterday|the other day|continue (that|the|our|with)|that (plan|timetable|schedule|answer|explanation)|our (plan|chat|conversation|timetable)|what did we|remind me what)\b|කලින්|ඊයේ|අපි (කතා|හදපු|කරපු)|අර (plan|සැලැස්ම)|\b(kalin|iye|api kathakarapu|api hadapu)\b/i;

/** Asks what OLIS knows / was told about the student. */
export const MEMORY_CUE =
  /\b(what did i (tell|say|mention)|did i tell you|do you (remember|know) (me|my|what|that)|what do you know about me|remember (me|my)|my (favou?rite|weak|strong) (subject|topic)s?|about my (study )?(goals?|exam|subjects?|plan))\b|මම (කිව්ව|කියපු)|මතකද|\b(mama kiyapu|mathakada)\b/i;
