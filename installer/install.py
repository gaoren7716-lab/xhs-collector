#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
小红书采集工作台 - 浏览器扩展静默安装程序 (PyInstaller onefile)
把扩展 crx 释放到固定目录，并通过 Windows 注册表为
Chrome / Edge / Brave 配置「外部扩展(External Extension)」实现静默安装。
有管理员权限时写 HKLM(全用户)，否则回退 HKCU(仅当前用户)。
"""
import os
import sys
import shutil
import ctypes
import winreg

EXT_ID = "ujbynndlkj21qqzh"
VERSION = "1.0.0"
APP_NAME = "xhs-collector"

FILES = [
    ("xhs-collector.crx", "xhs-collector.crx"),
    ("xhs-collector.pem", "xhs-collector.pem"),
    ("xhs-collector-v1.0.0.tar.gz", "xhs-collector-v1.0.0.tar.gz"),
]

# (显示名, HKCU 子键, HKLM Wow6432Node 子键)
BROWSERS = [
    ("Google Chrome", r"Software\Google\Chrome\Extensions",
     r"Software\Wow6432Node\Google\Chrome\Extensions"),
    ("Microsoft Edge", r"Software\Microsoft\Edge\Extensions",
     r"Software\Wow6432Node\Microsoft\Edge\Extensions"),
    ("Brave", r"Software\BraveSoftware\Brave-Browser\Extensions",
     r"Software\Wow6432Node\BraveSoftware\Brave-Browser\Extensions"),
]


def log(msg):
    print(msg)
    log_lines.append(msg)


log_lines = []


def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def resource_path(name):
    # PyInstaller onefile 会把 --add-data 文件放到 sys._MEIPASS
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, name)


def pick_install_dir(admin):
    if admin:
        return os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), APP_NAME)
    return os.path.join(os.environ.get("LOCALAPPDATA", r"C:\Users\Public"), APP_NAME)


def set_ext_key(hive, subkey, ext_id, crx_path, ver):
    try:
        key_path = subkey + "\\" + ext_id
        key = winreg.CreateKeyEx(hive, key_path, 0, winreg.KEY_WRITE)
        winreg.SetValueEx(key, "path", 0, winreg.REG_SZ, crx_path)
        winreg.SetValueEx(key, "version", 0, winreg.REG_SZ, ver)
        winreg.CloseKey(key)
        return True
    except Exception:
        return False


def main():
    admin = is_admin()
    install_dir = pick_install_dir(admin)
    log("=" * 42)
    log("小红书采集工作台 安装程序")
    log("扩展ID : " + EXT_ID)
    log("版本   : " + VERSION)
    log("管理员 : " + str(admin))
    log("目标目录: " + install_dir)
    log("=" * 42)

    # 1) 释放文件
    try:
        os.makedirs(install_dir, exist_ok=True)
        for src_name, dst_name in FILES:
            s = resource_path(src_name)
            if os.path.exists(s):
                shutil.copy2(s, os.path.join(install_dir, dst_name))
                log("已释放: " + dst_name)
            else:
                log("警告: 源文件缺失 " + src_name + " (跳过)")
    except Exception as e:
        log("释放文件失败: " + str(e))
    crx_path = os.path.join(install_dir, "xhs-collector.crx")

    # 2) 注册表写入
    for name, hkcu_sub, hklm_sub in BROWSERS:
        done = False
        scope = ""
        if admin and set_ext_key(winreg.HKEY_LOCAL_MACHINE, hklm_sub, EXT_ID, crx_path, VERSION):
            done, scope = True, "HKLM"
        if not done and set_ext_key(winreg.HKEY_CURRENT_USER, hkcu_sub, EXT_ID, crx_path, VERSION):
            done, scope = True, "HKCU"
        log("配置 %s: %s" % (name, (scope + " OK") if done else "FAILED"))

    # 3) 日志
    try:
        with open(os.path.join(install_dir, "install.log"), "w", encoding="utf-8") as f:
            f.write("\n".join(log_lines))
    except Exception:
        pass
    log("=" * 42)
    log("安装结束。请重启浏览器使扩展生效。")
    log("=" * 42)


if __name__ == "__main__":
    main()
