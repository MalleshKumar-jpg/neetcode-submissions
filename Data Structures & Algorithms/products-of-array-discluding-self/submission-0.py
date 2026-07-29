class Solution:
    def productExceptSelf(self, nums: List[int]) -> List[int]:
        pre = [1]
        suf = [1]
        for i in range(1,len(nums)):
            pre.append(pre[i-1]*nums[i-1])
        
        for i in range(len(nums)-1,0,-1):
            suf.insert(0,suf[0]*nums[i])
        
        res = [x*y for (x,y) in zip(pre,suf)]
        return res