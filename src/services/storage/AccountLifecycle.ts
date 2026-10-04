let resetting = false;
export const isAccountResetting = (): boolean => resetting;
export const beginAccountReset = (): void => { resetting = true; };
