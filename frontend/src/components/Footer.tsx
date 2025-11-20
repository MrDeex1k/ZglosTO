import { cityName } from './config/city';

export function Footer() {
  return (
    <footer className="bg-white border-t mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="text-center text-gray-600">
          Miasto {cityName} dziękuje za bycie odpowiedzialnym obywatelem
        </div>
      </div>
    </footer>
  );
}