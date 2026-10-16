# DUVANSI — Spatial portfolio

Bản portfolio riêng lấy cảm hứng từ ngôn ngữ không gian của [Alche Studio](https://alche.studio/): monogram, typography lớn, không gian lưới cong và một câu chuyện chuyển theo cuộn.

Thư mục này chạy độc lập. Bản portfolio ở thư mục cha vẫn sử dụng cổng 5173.

## Chạy bản mới

```sh
npm install
npm run dev
```

Mở http://127.0.0.1:5174/.

```sh
npm run build
npm run preview
```

Bản production nằm trong `dist/`; preview sử dụng cổng 4174.

## Trải nghiệm

- Loading intro nền đen với chữ D ba mảnh: vẽ nét viền, ghép hình, lên ánh kim và quét sáng; ba mảng nền mở vào cảnh 3D. Chỉ dùng SVG và đồng hồ GSAP hiện có, không thêm renderer hay video.
- Intro chờ ảnh, font và khung hình 3D sẵn sàng; có tiến độ tải, nút Skip, phím Escape và giới hạn chờ để tránh kẹt trang. Thiết lập giảm chuyển động/tắt chuyển động bỏ qua phần diễn hoạt; liên kết trực tiếp tới từng mục vẫn hoạt động sau loading.
- Chữ D dựng bằng Three.js, gồm ba mảnh có bevel, vật liệu kim loại, phản xạ studio và ánh sắc xanh/tím.
- Cuộn nối cảnh mở đầu, gallery ba dự án, cảnh sáng tách chữ D, giới thiệu và liên hệ.
- Cảnh mở đầu kéo dài 540svh trên desktop / 500svh trên mobile, với bốn nhịp thành hình, đổi góc nhìn, tách khối và ghép lại. Link cuộn đi từng nhịp; menu vẫn cho phép đến thẳng dự án.
- Vệt chuột dùng trường chuyển động GPU để loang màu và khúc xạ không gian; bấm tạo sóng lan. Vuốt trên màn hình cảm ứng cũng tạo vệt mà vẫn giữ thao tác cuộn tự nhiên.
- Ảnh dự án uốn theo tốc độ chuyển cảnh, nghiêng theo góc nhìn và có sóng/ánh sáng khi rê chuột. Hiệu ứng giảm chuyển động có gallery tĩnh dự phòng.
- Gallery có nút chuyển dự án, chi tiết, danh sách tám dự án và bộ lọc.
- Menu hỗ trợ bàn phím; dialog hỗ trợ Escape và giữ focus. Có sao chép email, giờ địa phương và nút tạm dừng chuyển động.
- Tôn trọng thiết lập giảm chuyển động của hệ điều hành. Khi WebGL không khả dụng, vẫn hiển thị monogram SVG, gallery và toàn bộ nội dung.
- Tối ưu mật độ điểm ảnh theo sức máy, giữ nhịp vẽ tự nhiên của màn hình và dừng vẽ khi tab ẩn.

## Hiệu năng

Toàn bộ cảnh, vật liệu, vệt chuột, sóng và ảnh uốn được giữ nguyên. Hệ thống giảm phần tính toán dư thay vì bỏ hiệu ứng:

- Khi vệt đã tan, bỏ qua cả lượt mô phỏng lẫn lượt khúc xạ; dựng trực tiếp với cùng phép chuyển màu filmic. Vệt mới kích hoạt ngay khi có tương tác.
- Mật độ điểm ảnh tự điều chỉnh theo tải GPU (đo bất đồng bộ nếu trình duyệt hỗ trợ) và thời gian khung hình. Có ngưỡng, thời gian chờ và phục hồi từ từ; thiết bị yếu có thể thấy chi tiết 3D mềm hơn. Chữ và giao diện vẫn ở độ phân giải gốc. Bộ đệm 3D còn có giới hạn tổng điểm ảnh và kích thước theo GPU, tránh cấp phát quá lớn trên màn hình 4K/5K.
- Giữ nguyên hình học và hiệu ứng ảnh; dùng chung bộ đệm hình học, bỏ các lượt vẽ hoàn toàn trong suốt và tránh cấp phát đối tượng trong mỗi khung hình.
- Chuẩn bị shader trước khi hiện cảnh và dùng bộ đệm khúc xạ RGBA8 có làm mịn cạnh, thay cho bộ đệm HDR nặng hơn.
- Nghỉ dựng nền khi mở menu/chi tiết, và khi tab ẩn. Giảm cập nhật chữ, thuộc tính và phép đo bố cục lặp lại; gom cập nhật con trỏ theo khung hình.

Kiểm tra hồi quy:

```sh
node --test src/render-budget.test.mjs src/flow-field.test.mjs
```

Các số đo trong thuộc tính `data-render-*` của canvas chỉ có ở bản phát triển, không hiện thành giao diện sản phẩm. Trong lần kiểm tra ở cửa sổ 663×764, cảnh mở đầu khi vệt đã tan giảm từ 11 xuống 7 lượt vẽ GPU mỗi khung hình; đây không phải cam kết FPS cho mọi thiết bị.

## Nội dung & tài sản

Thông tin cá nhân và danh sách dự án lấy từ bản portfolio hiện có. Chân dung được giữ nguyên từ tài sản của người dùng. Ba hình Velo / Nōka / Kira là các visual study SVG được thiết kế riêng cho bản này; không sử dụng artwork của Alche. Hãy thay visual study bằng ảnh dự án thực tế trước khi dùng chúng như case study chính thức.

- `src/world.js`: hình học, ánh sáng, phản xạ, camera và các cảnh 3D.
- `src/flow-field.js`: trường chuyển động, vệt màu, sóng và khúc xạ.
- `src/render-budget.js`: đo tải và điều chỉnh mật độ điểm ảnh.
- `src/display-material.js`: giữ màu đồng nhất giữa các đường dựng hình.
- `src/main.js`: điều hướng, cuộn, tương tác, focus và chuyển động.
- `src/intro.js`, `src/intro.css`: loading chữ D, tiến độ và chuyển cảnh mở đầu.
- `src/projects.js`: dữ liệu dự án.
- `src/style.css`: bố cục desktop/mobile.
- `public/images/`: chân dung và visual study SVG.

Font được tải từ Google Fonts: Space Grotesk, DM Sans, JetBrains Mono; có font hệ thống dự phòng. Không dùng asset hoặc mã nguồn trích xuất từ trang tham chiếu.
