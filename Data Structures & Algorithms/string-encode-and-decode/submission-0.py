class Solution:
    def encode(self, strs: List[str]) -> str:
        res=[]
        for string in strs:
            res.append(str(len(string))+"#")
            res.append(string)
        return "".join(res)
    
    def decode(self, s: str) -> List[str]:
        strs=[]
        pos=0
        while pos <len(s):
            delim_idx = s.find("#",pos)
            c = int(s[pos:delim_idx])
            strs.append(s[delim_idx+1:delim_idx+c+1])
            pos = delim_idx+c+1
        return strs