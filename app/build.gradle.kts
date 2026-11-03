import java.io.FileInputStream
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

// 签名材料不入库：本地放 keystore.properties（见 keystore.properties.example）即产出
// 签名 release 包；缺失时 release 走未签名产物，不影响开发构建。
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("keystore.properties")
val hasKeystore = keystorePropertiesFile.exists()
if (hasKeystore) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    buildFeatures {
        buildConfig = true
    }
    namespace = "com.fct.gardendless"
    compileSdk {
        version = release(36)
    }

    defaultConfig {
        // 与上游 APK 同包名：配合上游签名密钥即可覆盖升级，
        // 存档 / GP-Next 数据 / 键位原地继承（不同包名 = 不同数据目录，会丢进度）。
        applicationId = "com.fct.gardendless"
        minSdk = 27
        targetSdk = 36
        // versionCode 同时是游戏包解压的版本键（GameActivity），每次发版递增。
        // ⚠️ 升级安装要求 versionCode >= 已装版本（上游 v0.15.0 = 13）。
        // 版本约定：versionName 跟随游戏包（0.16.8）；壳自身有改动时只递增
        // versionCode（它同时是资源解压键），显示版本保持与游戏一致。
        // 允许构建期覆盖：./gradlew -PversionCode=21 -PversionName=0.16.8
        versionCode = providers.gradleProperty("versionCode").orNull?.toInt() ?: 21
        versionName = providers.gradleProperty("versionName").orNull ?: "0.16.8"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // WebView 远程调试开关：-PwebviewDebug=true 时打开（诊断用，默认关）
        buildConfigField(
            "boolean",
            "WEBVIEW_DEBUG",
            (providers.gradleProperty("webviewDebug").orNull?.toBoolean() ?: false).toString()
        )
    }

    if (hasKeystore) {
        signingConfigs {
            create("release") {
                keyAlias = keystoreProperties["keyAlias"] as String?
                keyPassword = keystoreProperties["keyPassword"] as String?
                storeFile = keystoreProperties["storeFile"]?.let { file(it) }
                storePassword = keystoreProperties["storePassword"] as String?
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (hasKeystore) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.webkit)
    implementation(libs.material)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}