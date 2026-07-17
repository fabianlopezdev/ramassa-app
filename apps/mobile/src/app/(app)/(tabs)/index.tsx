import { Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-2xl font-bold text-emerald-700">Ramassà</Text>
      <Text className="mt-2 text-base text-neutral-500">Mobile scaffold is running</Text>
    </View>
  );
}
