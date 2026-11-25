import json,sys
S={}
def P(v,*items): return [{"id":i,"role":r} for i,r in items]
S['1jn2-15']=("1 John 2:15",{"15":[("CAL2.15.03","overview"),("CAL2.15.04","word"),("GIL2.15.01","word"),("JFB2.15.03","meaning"),("JFB2.15.02","tension"),("MHC2.15.03","doctrine"),("AUG2.15.1.02","application"),("AUG2.15.2.01","warning"),("CYR2.15.1.01","application")]})
S['rom13-11']=("Romans 13:11",{"11":[("CAL13.11.03","overview"),("AUG13.11.1.01","context"),("JFB13.11.01","meaning"),("MHC13.11.03","word"),("CAL13.11.05","word"),("GIL13.11.04","doctrine"),("CHR13.11.1.03","warning"),("MHC13.11.04","application")]})
S['mrk13-35']=("Mark 13:35",{"35":[("JFB13.35.01","overview"),("GIL13.35.01","application"),("GIL13.35.02","doctrine"),("GIL13.35.03","word")]})
S['eph1-15-23']=("Ephesians 1:15-23",{
"15":[("MHC1.15.01","context"),("JFB1.15.01","meaning")],
"16":[("CAL1.16.01","meaning"),("GIL1.16.02","application")],
"17":[("CAL1.17.01","overview"),("MHC1.17.04","doctrine"),("JFB1.17.02","meaning")],
"18":[("MHC1.18.01","meaning"),("CAL1.18.01","word")],
"19":[("CAL1.19.01","word"),("MHC1.19.03","doctrine")],
"20":[("MHC1.20.01","overview"),("JFB1.20.01","doctrine")],
"21":[("CAL1.21.02","meaning"),("JFB1.21.02","context"),("CHR1.21.1.04","doctrine")],
"22":[("CAL1.22.01","doctrine"),("MHC1.22.02","meaning"),("CHR1.22.1.03","application")],
"23":[("JFB1.23.01","meaning"),("CHR1.23.1.03","doctrine")]})
S['mat25-31-46']=("Matthew 25:31-46",{
"31":[("CAL25.31.01","overview"),("JFB25.31.01","meaning")],
"32":[("MHC25.32.04","meaning"),("AUG25.32.1.01","context")],
"33":[("MHC25.33.03","meaning"),("JFB25.33.01","word")],
"34":[("CHR25.34.1.01","meaning"),("GIL25.34.05","doctrine")],
"35":[("MHC25.35-36.03","doctrine"),("GIL25.35.03","word")],
"36":[("GIL25.36.01","word"),("CAL25.35.04","application")],
"37":[("CAL25.37.02","meaning"),("GIL25.37.01","context")],
"38":[("GIL25.38.02","word"),("MHC25.37-39.01","meaning")],
"39":[("GIL25.39.01","meaning"),("MHC25.37-39.02","doctrine")],
"40":[("CHR25.40.1.01","meaning"),("JFB25.40.06","doctrine")],
"41":[("MHC25.41.01","meaning"),("CHR25.41.1.02","doctrine")],
"42":[("CHR25.42-43.1.02","meaning"),("CAL25.41.03","word")],
"43":[("GIL25.43.02","meaning"),("MHC25.43.02","warning")],
"44":[("GIL25.44.01","meaning"),("CHR25.44.1.01","context"),("CAL25.44.01","warning")],
"45":[("GIL25.45.01","meaning"),("CHR25.45.3.03","application")],
"46":[("MHC25.46.01","overview"),("AUG25.46.1.03","doctrine"),("MHC25.46.03","warning"),("JFB25.46.02","doctrine")]})
for k,(scope,v) in S.items():
    json.dump({"scope":scope,"edition":"WEB","verses":{n:[{"id":i,"role":r} for i,r in it] for n,it in v.items()}},open(f"plans/plan-{k}-claude-sorter.json","w"),indent=1)
