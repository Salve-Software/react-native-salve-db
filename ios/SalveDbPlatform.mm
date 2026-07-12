#import <Foundation/Foundation.h>
#import <Security/Security.h>
#include "../cpp/platform/platform.hpp"

namespace margelo::nitro::salvedb::platform {

// s_baseDirectory is not used on iOS — documents dir is resolved on demand.
void setDocumentsDirectory(const std::string&) {}

std::string getDocumentsDirectory() {
  NSArray<NSString*>* paths =
    NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  if (paths.count == 0)
    return "/tmp/salvedb";
  return std::string(paths.firstObject.UTF8String);
}

namespace {

// One fixed Keychain service for every credential key — MVP has a single
// global credential per app install, not a namespace of them.
NSString* const kKeychainService = @"com.salvedb.credentials";

NSMutableDictionary* keychainQuery(const std::string& key) {
  return [@{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: kKeychainService,
    (__bridge id)kSecAttrAccount: [NSString stringWithUTF8String:key.c_str()],
  } mutableCopy];
}

} // namespace

void setSecureValue(const std::string& key, const std::string& value) {
  NSData* data = [NSData dataWithBytes:value.data() length:value.size()];

  NSMutableDictionary* query = keychainQuery(key);
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, nullptr);
  if (status == errSecSuccess) {
    NSDictionary* update = @{(__bridge id)kSecValueData: data};
    status = SecItemUpdate((__bridge CFDictionaryRef)query, (__bridge CFDictionaryRef)update);
  } else {
    query[(__bridge id)kSecValueData] = data;
    query[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleAfterFirstUnlock;
    status = SecItemAdd((__bridge CFDictionaryRef)query, nullptr);
  }

  if (status != errSecSuccess) {
    throw std::runtime_error("Keychain: failed to store value for key \"" + key + "\" (OSStatus " + std::to_string(status) + ")");
  }
}

std::optional<std::string> getSecureValue(const std::string& key) {
  NSMutableDictionary* query = keychainQuery(key);
  query[(__bridge id)kSecReturnData] = @YES;
  query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;

  CFTypeRef result = nullptr;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
  if (status == errSecItemNotFound) {
    return std::nullopt;
  }
  if (status != errSecSuccess) {
    throw std::runtime_error("Keychain: failed to read value for key \"" + key + "\" (OSStatus " + std::to_string(status) + ")");
  }

  NSData* data = (__bridge_transfer NSData*)result;
  return std::string(static_cast<const char*>(data.bytes), data.length);
}

void deleteSecureValue(const std::string& key) {
  NSMutableDictionary* query = keychainQuery(key);
  OSStatus status = SecItemDelete((__bridge CFDictionaryRef)query);
  if (status != errSecSuccess && status != errSecItemNotFound) {
    throw std::runtime_error("Keychain: failed to delete value for key \"" + key + "\" (OSStatus " + std::to_string(status) + ")");
  }
}

} // namespace margelo::nitro::salvedb::platform
