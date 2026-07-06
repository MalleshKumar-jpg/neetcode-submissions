class Solution {
    public List<List<String>> groupAnagrams(String[] strs) {
        Map<String, List<String>> res = new HashMap<>();

        for(String s : strs){
            char[] sorted = s.toCharArray();
            Arrays.sort(sorted);
            String sortedS = new String(sorted);
            if(!res.containsKey(sortedS)){
                res.put(sortedS, new ArrayList<>());
            }
            res.get(sortedS).add(s);
        }
        return new ArrayList<>(res.values());
    }
}
