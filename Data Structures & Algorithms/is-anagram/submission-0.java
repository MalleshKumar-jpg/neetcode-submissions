class Solution {
    public boolean isAnagram(String s, String t) {
        
        if(s.length() != t.length()){
            return false;
        }

        HashMap<Character,Integer> frequencyMapS = new HashMap<Character,Integer>();
        HashMap<Character,Integer> frequencyMapT = new HashMap<Character, Integer>();

        for(char i: s.toCharArray()){
            if(frequencyMapS.containsKey(i)){
                frequencyMapS.put(i,frequencyMapS.get(i)+1);
            }else{
                frequencyMapS.put(i,1);
            }
        }
    
        for(char i: t.toCharArray()){
            if(frequencyMapT.containsKey(i)){
                frequencyMapT.put(i,frequencyMapT.get(i)+1);
            }else{
                frequencyMapT.put(i,1);
            }
        }

    return frequencyMapS.equals(frequencyMapT);
    }
}






